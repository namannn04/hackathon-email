# Relay architecture

## Access model

`proxy.ts` runs before every page request and refreshes the Neon Auth session cookie. Neon Auth trusts its signed session-data cookie for five minutes and then refetches the session upstream and rewrites that cookie; a React Server Component may not write cookies, so without this the refresh threw `Cookies can only be modified in a Server Action or Route Handler` for any signed-in visitor whose cached session had aged out. The proxy only refreshes — it never redirects, because the pages render their own signed-out screens and every page, route, and query still enforces access on the server. API routes are outside its matcher since a route handler can set cookies itself.

`/unsubscribe` and `/api/unsubscribe` are public: a recipient is not a Relay user and has no session. Authority comes from an HMAC-signed token naming the mail task, plus a check that the submitted address is on that event's recipient list. Suppression is global, and both mail-task creation and every send filter against it.

Neon Auth supplies the website identity and stores its auth state alongside the Neon branch. Relay mirrors the Neon Auth user ID into its Prisma `User` model and derives organizer status from `RELAY_ORGANIZER_EMAILS`; there is no built-in admin password. Volunteers see an event only after accepting that event's hashed, expiring invitation. Every event, preview, and send query enforces organizer or event-member access at the server.

Gmail OAuth is a second, independent authorization. Each connected account belongs to one Relay user, OAuth state is expiring and single-use, PKCE is used, and tokens are encrypted before storage. A send endpoint accepts only a Gmail account owned by the signed-in user.

## Data model

- `Event` owns one normalized `EventRecipient` list and event-scoped memberships/invites.
- `MailTask` belongs to an event and freezes the fixed To, subject, plain/HTML body, and target set size for one outreach round. Both bodies are the output of `compileEmailBody` in `lib/email-html/`, so the stored values are exactly what the MIME parts carry and what every preview renders. Only one of the two needs to be written: an HTML-only body gets its `text/plain` half derived from the compiled markup, and a text-only body gets a simple HTML document.
- `Batch` is one sendable set inside one mail task.
- `MailTaskRecipient` assigns every event recipient to exactly one batch for that task.
- `Send` provides one idempotency record per batch.
- `ActivityEvent` records automatic per-task success/failure history; `AuditEvent` records security-relevant mutations.

The deployed database is Neon PostgreSQL through Prisma's official Neon serverless adapter. Migration SQL also enforces the 499-BCC ceiling and a partial unique index preventing one Gmail account from being assigned to two concurrently sending sets.

## One-message send sequence

1. The user selects one available/failed set; no reservation is created.
2. The preview endpoint reloads server-authorized data and returns the fixed To/content plus the selected set's BCC list. A companion route, `/api/batches/preview/body`, returns the stored HTML body as a document with `cid:` references resolved, which the sending desk renders in a sandboxed iframe.
3. The send endpoint reloads authorization, validates ownership of the selected Gmail connection, and atomically acquires an expiring send lease.
4. Relay constructs one RFC 5322 MIME message with one `To` header and one folded `Bcc` header containing all unsuppressed addresses.
5. Relay makes exactly one Gmail `users.messages.send` call.
6. A transaction guarded by the same lease marks the send, batch, and recipients successful and creates the activity entry automatically.

A deterministic Message-ID and one database idempotency record per batch protect normal retries and concurrent clicks without requesting mailbox-reading access. Network-level uncertainty is recorded as a failure for a controlled retry. Header values are injection-checked and long BCC headers are safely folded.

## Batch planning

The planner fills target-sized sets. A final remainder below 100 is merged into the prior set only if the result remains at or below 499 BCC recipients; otherwise it remains separate. The 499 cap leaves one of Gmail's 500 per-message recipients for the fixed To address.
