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
