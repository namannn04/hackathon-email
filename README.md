# Relay

Relay lets an organizer create events, import participants once, create multiple mail tasks inside each event, and share event-scoped access with volunteers. A volunteer selects one set at a time, previews it, chooses one connected Gmail account, and sends exactly one message. The task's fixed `To`, subject, and body come from the organizer; every set recipient is placed in `BCC`.

## Implemented behavior

- Neon Auth sign-up/sign-in and event-only invitation membership.
- Organizer access controlled by the `RELAY_ORGANIZER_EMAILS` allowlist.
- PostgreSQL through Prisma, with checked-in migrations.
- CSV/XLSX event participant import, validation, normalization, and deduplication.
- Any number of separate mail tasks per event, each with its own fixed `To`, subject, body, sets, progress, and activity.
- One set can be selected at a time. Selection is not a reservation.
- One Gmail API call and one MIME message per set; addresses are shown in the preview and sent as BCC.
- Automatic success/failure activity entries with sender, set number, BCC count, and Gmail account.
- Idempotent sends, expiring send leases, deterministic Message-IDs, retry handling, and suppression support.

## Email body and images

A mail task stores a plain-text body and an HTML body, and both are sent as a `multipart/alternative` message. Either field on its own is enough — the missing half is built from the one you wrote, so the message always carries both alternatives:

- **Plain text only** — it is escaped into a simple HTML document for the `text/html` part.
- **HTML only** — the `text/plain` part is derived from the compiled HTML by `htmlToPlainText`: block boundaries become line breaks, list items become dashes, table rows stay on one line with `|` between cells, a link becomes `label (https://…)`, and an image becomes `[alt text]`. Whitespace collapses the way a browser collapses it, including inside `<pre>`. An empty text part reads as suspicious to spam filters and leaves text-only clients with a blank message, which is why it is never left empty.
- **Both** — each is used exactly as written; nothing is derived.

Submitting neither is the only rejected case.
- Filling it in runs the markup through the email-HTML compiler in `lib/email-html/`, so an organizer can lay the message out with tables, headings, lists, links, buttons, colours and inline CSS.
- Attaching images uploads them with the mail task and embeds them in the message itself as `multipart/related` parts. Reference them from the HTML body as `cid:image1`, `cid:image2`, in upload order. With no HTML body they are stacked on the side chosen by **Image placement**, above or below the text.

### What the compiler keeps

`sanitizeEmailHtml` decides once what the outgoing message carries, and reports every change it made:

- **Kept**: the tag allowlist in `lib/email-html/sanitize.ts` (tables and every table part, headings, paragraphs, lists, `a`, `img`, `blockquote`, `pre`, the usual inline formatting, `font`, `center`) with their layout attributes — `width`, `height`, `align`, `valign`, `bgcolor`, `background`, `border`, `cellpadding`, `cellspacing`, `colspan`, `rowspan`, `nowrap` — plus `style`, `title`, `dir`, `lang`, `class` and `id` on any of them.
- **Filtered**: `style` is checked declaration by declaration against a property allowlist (colour, font, spacing, border, sizing, alignment, list, table and flex/grid families). `position`, `behavior`, `filter`, `expression()` and friends are dropped without discarding the rest of the attribute.
- **Removed**: `script`, `iframe`, `form` and its controls, `object`, `embed`, `svg`, `video`, `audio` and their content; every `on*` handler; and any URL that is not `https`, `http`, `mailto`, `tel`, `cid` or an inline `data:image`, including entity-obfuscated `javascript:`.
- **Repaired**: unclosed and mis-nested tags are balanced, `<html>`/`<head>`/`<body>` scaffolding is unwrapped, and an `<img>` with no width is capped at `max-width:100%`. A style on `<body>` is carried over to a wrapping `<div>`, so a document's own font and background survive even though `<body>` itself cannot appear in a message body.

Pasting a complete HTML document is fine — `<!doctype>`, `<head>`, `<meta>`, `<title>` and `<body>` are handled and only the body content is kept.

### Deleting a mail task

Each mail task card in the admin portal has a delete control. It removes the message, its recipient sets, their delivery and send records, its inline images, and the task's activity; the event and its participant list are untouched.

- An in-flight send blocks the delete, the same rule the event delete follows.
- A task that has already sent is still removable, and the dialog says plainly that deleting it does not unsend anything. What was destroyed — including how many recipients had already received it — is kept in the audit trail and on the event's activity board.
- Suppressions survive: an unsubscribe outlives the task that prompted it.

### Unsubscribes

Every message carries a `List-Unsubscribe` header and a visible unsubscribe link, because both are what mailbox providers expect from bulk mail.

- The link is signed and names the **mail task**, not the person. One Gmail message carries a whole set in `Bcc`, so every recipient reads an identical body and a per-recipient link is impossible. The page therefore asks which address received the message.
- `List-Unsubscribe-Post: One-Click` is deliberately **not** advertised: a one-click POST could not say which recipient to remove, so claiming support would be a promise the Bcc design cannot keep. A `mailto:` fallback is offered alongside the link.
- The address must already be on that event's recipient list before anything is suppressed, so a link — which every recipient holds — cannot be used to block a stranger. A valid request always gives the same answer, so the page is not a membership oracle.
- By default the footer is appended to the body. Put `{{unsubscribe_url}}` in an `href` to place the link inside your own design instead.
- A test send carries the same footer and header, signed for an id no mail task will ever have. The page recognises it and says there is nothing to unsubscribe from, rather than claiming the link is broken.
- The link is written into the body when the mail task is created, using an id chosen before the row is written. The stored body is therefore already final — nothing is substituted at send time, which is what keeps a stored body's preview byte-exact.

**How this works with a CSV.** The spreadsheet is never edited. `Suppression.normalizedEmail` is unique and global, and both mail-task creation and every send filter recipients against it, so an unsubscribed address is skipped from then on — including after the same CSV is re-imported, and including addresses already queued in an unsent set.

### Send a test to yourself

The compose screen has a **Send test email** button. It compiles the body with the same compiler, builds the message with the same MIME builder, and calls the same Gmail API a real set uses — so it proves the pipeline, not a preview of it.

- The recipient is the signed-in organizer's own address, read from the session and never from the request.
- There is no `Bcc` and no second `To`; the header block carries the organizer's address alone, so a test cannot reach a participant.
- Nothing is persisted: no mail task, no set, no send record — only an audit entry.
- With `GMAIL_MOCK_TRANSPORT` on, it reports that nothing was delivered instead of pretending to send.

### Previews

The compiled HTML is what is stored on the mail task, what the MIME `text/html` part carries, and what both previews render, so a preview cannot drift from the delivered email.

- The compose screen runs the same compiler in the browser and renders the result in a sandboxed iframe, next to the HTML it will send, the plain-text alternative, and the list of adjustments it made.
- The sending desk fetches `GET /api/batches/preview/body?batchId=…`, which returns the stored body with each `cid:` reference resolved from the stored image bytes. Previews are sandboxed without `allow-scripts`, so nothing in a body can execute.

Inline images are limited to 5 files, 2 MB each and 8 MB in total, because every recipient set carries its own copy of the message.

## The fixed To list

A mail task's To field takes up to 5 comma-separated addresses. The compose form parses the field with the same code the API enforces, listing each address it read so two addresses are visibly two, and naming anything it rejected rather than dropping it quietly. Addresses are lowercased and de-duplicated.

Gmail counts To, Cc and Bcc together against one message's 500-recipient limit, so every extra To address costs a Bcc slot: one To leaves room for 499 Bcc, two for 498, and the set-size field's maximum follows along. The send path recomputes the same limit from the task's own To list, so a task created with one To address keeps its 499.

## Set sizing

The default target is 300 BCC recipients. A remainder of 100 or more becomes its own set. A remainder below 100 is merged into the previous set when that does not exceed 499 BCC recipients (Gmail's 500-recipient message limit also counts the fixed `To`). Examples:

- 1,050 recipients -> `300, 300, 300, 150`
- 950 recipients -> `300, 300, 350`

## Local setup

Requirements: Node.js 22.13+ and npm.

1. Copy `.env.example` to `.env.local` and fill every required value.
2. Install packages: `npm install`.
3. Generate Prisma Client: `npm run db:generate`.
4. Apply migrations: `npm run db:deploy`.
5. Start Relay: `npm run dev`.
6. Open `http://localhost:3000/auth/sign-up`, create the organizer account using an email in `RELAY_ORGANIZER_EMAILS`, then open `http://localhost:3000/admin`.

There is intentionally no hardcoded admin ID or password. Neon Auth owns the password/sign-in method. Removing an email from `RELAY_ORGANIZER_EMAILS` removes organizer access the next time that account is synchronized.

## Environment variables

- `DATABASE_URL`: pooled `postgresql://` connection string from the Neon branch, used by Prisma's Neon adapter.
- `NEON_AUTH_BASE_URL`: enable Auth on the same Neon branch and copy its Auth URL from the Neon Console.
- `NEON_AUTH_COOKIE_SECRET`: stable secret of at least 32 characters used to sign the cached session cookie (`openssl rand -base64 32`).
- `RELAY_ORGANIZER_EMAILS`: comma-separated organizer login emails.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth Web application credentials after enabling the Gmail API.
- `GOOGLE_REDIRECT_URI`: exact Gmail callback; locally `http://localhost:3000/api/gmail/callback`, and in production `https://YOUR-DOMAIN/api/gmail/callback`. Add the same exact value to Google Cloud's authorized redirect URIs.
- `SITE_ORIGIN`: public application origin, without a trailing slash.
- `TOKEN_ENCRYPTION_KEY`: random base64url key used to encrypt Gmail tokens at rest.
- `EMAIL_TRANSPORT`: `mock` for local UI testing or `gmail` for real Gmail sending.
- `RELAY_CONTACT_EMAIL`, `RELAY_LEGAL_ENTITY`, `RELAY_GOVERNING_LAW`: shown on the public home, privacy, and terms pages. Set them before submitting the app for Google OAuth verification; the defaults are placeholders.

Gmail connection is separate from website authentication. A volunteer first signs into Relay through Neon Auth, then connects one or more Gmail accounts. The OAuth flow requests identity scopes plus `gmail.send`; Relay does not request mailbox-reading access. Google classifies `gmail.send` as a sensitive scope, so a public production app may require OAuth verification.

## Public pages and the Google OAuth consent screen

Three routes are public and render without a session or a database read, because Google's OAuth consent screen links to them and a reviewer must be able to open them:

- `/` — signed-out visitors get a landing page describing the app, the requested scopes, and the Limited Use disclosure. Signed-in users get the application.
- `/privacy` — privacy policy.
- `/terms` — terms of service.

In the Google Cloud consent screen, the authorized domain must be the top private domain (`example.com`), not the subdomain the app runs on (`relay.example.com`). Verify that domain in Google Search Console with the same account that owns the Cloud project. `gmail.send` is a sensitive scope: while the app is in Testing, refresh tokens expire after seven days, so connected Gmail accounts must be reconnected weekly until the app is published and verified.

## Deploying to Vercel

The app is a standard Next.js App Router project, so importing the repository is enough. Set every variable from `.env.example` in the Vercel project, using the deployed origin:

- `SITE_ORIGIN=https://relay.example.com`
- `GOOGLE_REDIRECT_URI=https://relay.example.com/api/gmail/callback`, added verbatim to the OAuth client's authorized redirect URIs.
- `EMAIL_TRANSPORT=gmail`

`postinstall` runs `prisma generate`, so the client is built on Vercel from a clean checkout. Apply migrations with `npm run db:deploy` against the production `DATABASE_URL` before the first deploy. Pick a Vercel region close to the Neon database region to keep query latency low.

## Admin workflow

1. Sign in and open `/admin`.
2. Create an event and upload the participant CSV/XLSX.
3. Create the first mail task with its fixed To, subject, body, and target set size.
4. Create an event invitation and share that link. It grants access only to that event.
5. Later, select the same event and create another mail task for the follow-up email. Relay rebuilds sets from that event's participant list.
6. Watch the mail-task-specific activity board; successful sends appear automatically.

## Quality checks

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

See `docs/ARCHITECTURE.md` for the data and send-safety design.
