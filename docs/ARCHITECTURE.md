# Relay architecture

## Access model

Neon Auth supplies the website identity and stores its auth state alongside the Neon branch. Relay mirrors the Neon Auth user ID into its Prisma `User` model and derives organizer status from `RELAY_ORGANIZER_EMAILS`; there is no built-in admin password. Volunteers see an event only after accepting that event's hashed, expiring invitation. Every event, preview, and send query enforces organizer or event-member access at the server.

Gmail OAuth is a second, independent authorization. Each connected account belongs to one Relay user, OAuth state is expiring and single-use, PKCE is used, and tokens are encrypted before storage. A send endpoint accepts only a Gmail account owned by the signed-in user.

## Data model

- `Event` owns one normalized `EventRecipient` list and event-scoped memberships/invites.
- `MailTask` belongs to an event and freezes the fixed To, subject, plain/HTML body, and target set size for one outreach round.
- `Batch` is one sendable set inside one mail task.
- `MailTaskRecipient` assigns every event recipient to exactly one batch for that task.
- `Send` provides one idempotency record per batch.
- `ActivityEvent` records automatic per-task success/failure history; `AuditEvent` records security-relevant mutations.

The deployed database is Neon PostgreSQL through Prisma's official Neon serverless adapter. Migration SQL also enforces the 499-BCC ceiling and a partial unique index preventing one Gmail account from being assigned to two concurrently sending sets.

## One-message send sequence

1. The user selects one available/failed set; no reservation is created.
2. The preview endpoint reloads server-authorized data and returns the fixed To/content plus the selected set's BCC list.
3. The send endpoint reloads authorization, validates ownership of the selected Gmail connection, and atomically acquires an expiring send lease.
4. Relay constructs one RFC 5322 MIME message with one `To` header and one folded `Bcc` header containing all unsuppressed addresses.
5. Relay makes exactly one Gmail `users.messages.send` call.
6. A transaction guarded by the same lease marks the send, batch, and recipients successful and creates the activity entry automatically.

A deterministic Message-ID and one database idempotency record per batch protect normal retries and concurrent clicks without requesting mailbox-reading access. Network-level uncertainty is recorded as a failure for a controlled retry. Header values are injection-checked and long BCC headers are safely folded.

## Batch planning

The planner fills target-sized sets. A final remainder below 100 is merged into the prior set only if the result remains at or below 499 BCC recipients; otherwise it remains separate. The 499 cap leaves one of Gmail's 500 per-message recipients for the fixed To address.
