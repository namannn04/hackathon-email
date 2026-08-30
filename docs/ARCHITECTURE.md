# Relay architecture proposal

Relay is an internal coordination tool, not an email-marketing suite. The design keeps the volunteer path short while making claims and sends safe at the database boundary.

## Final folder structure

```text
hackathon-mailer/
├── app/
│   ├── api/
│   │   ├── batches/claim/route.ts
│   │   ├── campaigns/route.ts
│   │   ├── gmail/callback/route.ts
│   │   ├── gmail/connect/route.ts
│   │   ├── imports/route.ts
│   │   └── sends/route.ts
│   ├── campaigns/[campaignId]/page.tsx
│   ├── my-batches/page.tsx
│   ├── admin/page.tsx
│   ├── components/
│   ├── chatgpt-auth.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── db/
│   ├── index.ts
│   ├── schema.ts
│   └── seed.ts
├── drizzle/                 # checked-in D1 migrations
├── lib/
│   ├── auth/
│   ├── campaigns/
│   ├── claims/
│   ├── crypto/
│   ├── gmail/
│   ├── imports/
│   └── sending/
├── prisma/schema.prisma     # requested relational design reference
├── tests/
├── docs/
└── .openai/hosting.json
```

The deployed runtime uses Cloudflare D1 through Drizzle because the generated Sites runtime is Worker-based. The equivalent Prisma model is kept as an explicit relational contract, while the executable D1 schema and migrations remain the source of truth for deployment.

## Proposed Prisma schema

```prisma
enum UserRole { ORGANIZER VOLUNTEER }
enum CampaignStatus { DRAFT READY ACTIVE PAUSED COMPLETED ARCHIVED }
enum BatchStatus { AVAILABLE CLAIMED SENDING SENT FAILED }
enum RecipientStatus { PENDING RESERVED SENT FAILED SUPPRESSED }
enum SendStatus { QUEUED DISPATCHING SENT RETRYABLE_FAILED PERMANENT_FAILED CANCELLED }

model User {
  id String @id @default(cuid())
  externalId String @unique
  email String @unique
  name String?
  role UserRole @default(VOLUNTEER)
  gmailAccounts GmailAccount[]
  claimedBatches Batch[] @relation("BatchClaimer")
  auditEvents AuditEvent[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Campaign {
  id String @id @default(cuid())
  name String
  subject String
  bodyHtml String
  bodyText String
  batchSize Int @default(300)
  status CampaignStatus @default(DRAFT)
  createdById String
  recipients Recipient[]
  batches Batch[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Recipient {
  id String @id @default(cuid())
  campaignId String
  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  batchId String?
  batch Batch? @relation(fields: [batchId], references: [id])
  email String
  normalizedEmail String
  status RecipientStatus @default(PENDING)
  sentAt DateTime?
  @@unique([campaignId, normalizedEmail])
  @@index([campaignId, status])
  @@index([batchId, status])
}

model Batch {
  id String @id @default(cuid())
  campaignId String
  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  number Int
  status BatchStatus @default(AVAILABLE)
  claimedById String?
  claimedBy User? @relation("BatchClaimer", fields: [claimedById], references: [id])
  claimedAt DateTime?
  gmailAccountId String?
  gmailAccount GmailAccount? @relation(fields: [gmailAccountId], references: [id])
  recipients Recipient[]
  send Send?
  @@unique([campaignId, number])
  @@index([campaignId, status])
  @@index([claimedById, status])
}

model GmailAccount {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  googleSubject String
  email String
  accessTokenCiphertext String
  refreshTokenCiphertext String
  tokenExpiresAt DateTime
  scopes String
  revokedAt DateTime?
  batches Batch[]
  @@unique([userId, googleSubject])
}

model Send {
  id String @id @default(cuid())
  batchId String @unique
  batch Batch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  idempotencyKey String @unique
  deterministicMessageId String @unique
  status SendStatus @default(QUEUED)
  attemptCount Int @default(0)
  leaseOwner String?
  leaseExpiresAt DateTime?
  providerMessageId String?
  lastErrorCode String?
  lastErrorMessage String?
  nextAttemptAt DateTime?
  sentAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Suppression {
  id String @id @default(cuid())
  normalizedEmail String @unique
  reason String
  createdAt DateTime @default(now())
}

model AuditEvent {
  id String @id @default(cuid())
  actorId String?
  actor User? @relation(fields: [actorId], references: [id])
  action String
  entityType String
  entityId String
  metadataJson String
  createdAt DateTime @default(now())
  @@index([entityType, entityId, createdAt])
}
```

## Atomic batch-claim strategy

Claims use one parameterized SQL statement, not a read-then-write sequence. The statement updates only rows that are still `AVAILABLE`, belong to the requested campaign, and are in the requested ID set. A count guard inside the same statement requires every selected row to still be available; otherwise zero rows are changed. `RETURNING` provides the claimed records. The service rejects requests larger than three and checks the volunteer's active-claim cap inside that statement. Because the availability check and update occur in one SQLite write transaction, concurrent volunteers cannot both acquire the same batch.

## Idempotent sending strategy

Each batch has exactly one `Send` row and one stable idempotency key. A single conditional update acquires a short send lease only from a retryable state. The Gmail MIME payload uses a deterministic RFC 822 `Message-ID`. After Gmail accepts the message, its provider ID is persisted and the batch plus all unsuppressed recipients are marked sent in one database batch. If the response is ambiguous, a retry first searches the connected Gmail account for that deterministic message ID; finding it finalizes the existing send instead of sending again. Expired leases are recoverable, permanent provider errors are not retried, and retryable errors use bounded exponential backoff with jitter.

Tokens are encrypted with AES-GCM using a runtime-only key, never returned to the browser, and every Gmail-account lookup is scoped to the signed-in owner.
