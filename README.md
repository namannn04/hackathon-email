# Relay

Relay is a focused internal tool for coordinating hackathon promotional email batches. Organizers import a CSV/XLSX once; volunteers claim up to three batches, attach one Gmail account to each, and send without copying addresses or touching BCC fields.

## What is implemented

- Campaign creation with subject, plain-text content, batch size, and CSV/XLSX import.
- Email validation, case-insensitive deduplication, global suppression checks, recipient records, and automatic batch generation.
- Database-atomic all-or-none claims with a three-active-batch cap.
- ChatGPT/Sites authentication with server-side organizer and ownership authorization.
- Multiple user-owned Google OAuth connections with PKCE, one-time state, verified Google identity tokens, and AES-GCM token encryption.
- One Gmail account per active batch, enforced by a partial unique database index.
- Idempotent BCC batch sends with a unique send record, conditional lease, deterministic RFC 822 Message-ID, ambiguous-response reconciliation, bounded retries, and provider error classification.
- Mock Gmail transport for local acceptance testing; production defaults to real Gmail.
- Volunteer progress UI, organizer analytics, suppression management, and an audit trail.

Relay intentionally does not include CRM, lead scoring, reply tracking, newsletter automation, or marketing pipelines.

## Runtime architecture

The deployable application runs on Vinext/Cloudflare Workers with D1 and Drizzle. The requested equivalent Prisma contract is in `prisma/schema.prisma`; the executable schema and generated migration are in `db/schema.ts` and `drizzle/`.

The detailed folder proposal, Prisma model, atomic-claim reasoning, and idempotent-send reasoning are in `docs/ARCHITECTURE.md`.

## Local setup

Requirements: Node.js 22.13 or newer and npm.

1. Copy `.env.example` to `.env.local`.
2. For local mock sending, keep `EMAIL_TRANSPORT=mock`; Google credentials are not required.
3. Install dependencies with `npm install`.
4. Apply the local D1 migration with `npm run db:migrate:local`.
5. Start Relay with `npm run dev` and open the printed local URL.
6. Use the local Sites sign-in. The first user created in a new database becomes the organizer; later users are volunteers.

The organizer page can import `tests/fixtures/sample-recipients.csv` for a safe end-to-end test. In local mock mode, volunteers can add test Gmail accounts from the My batches screen.

## Google OAuth and Gmail setup

For real Gmail sending:

1. Create a Google Cloud OAuth web client.
2. Enable the Gmail API.
3. Configure the exact callback URL ending in `/api/gmail/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
5. Generate a random 32-byte base64url value for `TOKEN_ENCRYPTION_KEY`.
6. Set `EMAIL_TRANSPORT=gmail` and `SITE_ORIGIN` to the trusted deployed origin.
7. Configure and complete Google's OAuth consent/verification requirements for the requested `gmail.send` and `gmail.readonly` scopes before inviting the team.

The read-only Gmail scope is used only to reconcile an ambiguous send by searching for Relay's deterministic Message-ID before any retry. Access and refresh tokens remain encrypted at rest and never enter client responses.

Relay caps a message at 500 recipients and defaults batches to 300. Gmail/Workspace daily recipient limits, account reputation controls, and provider rate limits still apply; Relay surfaces provider failures and applies bounded retry timing rather than bypassing those limits.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run db:generate
npm run build
```

The tests cover CSV validation/deduplication, all-or-none atomic claim SQL, the active-claim cap, safe MIME header folding, deterministic Message-ID construction, and header-injection resistance.

## Security notes

- All mutations require a signed-in platform identity and server-side ownership/role checks.
- Same-origin and Fetch Metadata checks reject cross-site mutations.
- Gmail OAuth uses PKCE, expiring single-use state, an exact configured redirect URI, and verified Google identity claims.
- Gmail account queries are always scoped to the owning Relay user.
- Unique constraints protect campaign recipient identity, batch numbering, active Gmail assignment, send idempotency keys, and deterministic Message-IDs.
- Suppressions are rechecked immediately before a provider call, not only during import.
- No API returns Gmail token ciphertext, recipient lists, or BCC contents to the volunteer browser.

Production access should remain private to the outreach team. Rotate `TOKEN_ENCRYPTION_KEY` only with a planned token re-encryption or forced Gmail reconnection procedure.
