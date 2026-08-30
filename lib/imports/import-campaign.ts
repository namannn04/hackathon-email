import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { auditStatement } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import { parseRecipientFile, type ParsedRecipient } from './parser';

export type CampaignImportInput = {
  name: string;
  subject: string;
  bodyText: string;
  batchSize: number;
  file: File;
};

export async function importCampaign(input: CampaignImportInput, actor: User) {
  const parsed = await parseRecipientFile(input.file).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Could not read the recipient file.';
    throw new HttpError(400, message, 'INVALID_RECIPIENT_FILE');
  });
  if (parsed.recipients.length === 0) {
    throw new HttpError(400, 'No valid email addresses were found.', 'NO_VALID_RECIPIENTS');
  }
  if (parsed.recipients.length > 100_000) {
    throw new HttpError(400, 'A campaign can contain at most 100,000 recipients.', 'IMPORT_TOO_LARGE');
  }

  const d1 = getD1();
  const now = new Date().toISOString();
  const campaignId = crypto.randomUUID();
  const suppressed = await findSuppressions(parsed.recipients.map((item) => item.normalizedEmail));
  const sendable = parsed.recipients.filter((item) => !suppressed.has(item.normalizedEmail));
  if (sendable.length === 0) {
    throw new HttpError(400, 'Every valid address is currently suppressed.', 'ALL_RECIPIENTS_SUPPRESSED');
  }
  const sendableIndexes = new Map(
    sendable.map((recipient, index) => [recipient.normalizedEmail, index] as const),
  );
  const batchIds = Array.from(
    { length: Math.ceil(sendable.length / input.batchSize) },
    () => crypto.randomUUID(),
  );

  try {
    await d1
      .prepare(
        `INSERT INTO campaigns
         (id, name, subject, body_html, body_text, batch_size, status, created_by_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      )
      .bind(
        campaignId,
        input.name,
        input.subject,
        plainTextToHtml(input.bodyText),
        input.bodyText,
        input.batchSize,
        actor.id,
        now,
        now,
      )
      .run();

    const batchStatements = batchIds.map((batchId, index) => {
      const recipientCount = Math.min(input.batchSize, sendable.length - index * input.batchSize);
      return d1
        .prepare(
          `INSERT INTO batches
           (id, campaign_id, number, recipient_count, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?)`,
        )
        .bind(batchId, campaignId, index + 1, recipientCount, now, now);
    });
    await runStatementChunks(batchStatements);

    const records = parsed.recipients.map((recipient) => {
      const sendableIndex = sendableIndexes.get(recipient.normalizedEmail);
      const isSuppressed = sendableIndex === undefined;
      return {
        ...recipient,
        id: crypto.randomUUID(),
        batchId: isSuppressed ? null : batchIds[Math.floor(sendableIndex / input.batchSize)],
        status: isSuppressed ? 'SUPPRESSED' : 'PENDING',
      };
    });
    await insertRecipients(campaignId, records, now);

    await d1.batch([
      d1
        .prepare(`UPDATE campaigns SET status = 'ACTIVE', updated_at = ? WHERE id = ?`)
        .bind(now, campaignId),
      auditStatement({
        actorId: actor.id,
        action: 'CAMPAIGN_IMPORTED',
        entityType: 'campaign',
        entityId: campaignId,
        metadata: {
          sourceFile: input.file.name,
          totalValues: parsed.totalValues,
          accepted: parsed.recipients.length,
          invalid: parsed.invalidCount,
          duplicates: parsed.duplicateCount,
          suppressed: suppressed.size,
          batches: batchIds.length,
        },
      }),
    ]);
  } catch (error) {
    await d1.prepare('DELETE FROM campaigns WHERE id = ?').bind(campaignId).run().catch(() => undefined);
    throw error;
  }

  return {
    campaignId,
    batches: batchIds.length,
    accepted: parsed.recipients.length,
    sendable: sendable.length,
    invalid: parsed.invalidCount,
    duplicates: parsed.duplicateCount,
    suppressed: suppressed.size,
  };
}

async function findSuppressions(emails: string[]): Promise<Set<string>> {
  const d1 = getD1();
  const result = new Set<string>();
  for (let start = 0; start < emails.length; start += 200) {
    const chunk = emails.slice(start, start + 200);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await d1
      .prepare(`SELECT normalized_email AS normalizedEmail FROM suppressions WHERE normalized_email IN (${placeholders})`)
      .bind(...chunk)
      .all<{ normalizedEmail: string }>();
    for (const row of rows.results) result.add(row.normalizedEmail);
  }
  return result;
}

async function insertRecipients(
  campaignId: string,
  records: Array<ParsedRecipient & { id: string; batchId: string | null; status: string }>,
  now: string,
) {
  const d1 = getD1();
  for (let start = 0; start < records.length; start += 50) {
    const chunk = records.slice(start, start + 50);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const values = chunk.flatMap((record) => [
      record.id,
      campaignId,
      record.batchId,
      record.email,
      record.normalizedEmail,
      record.status,
      now,
      now,
    ]);
    await d1
      .prepare(
        `INSERT INTO recipients
         (id, campaign_id, batch_id, email, normalized_email, status, created_at, updated_at)
         VALUES ${valuesSql}`,
      )
      .bind(...values)
      .run();
  }
}

async function runStatementChunks(statements: D1PreparedStatement[]) {
  const d1 = getD1();
  for (let start = 0; start < statements.length; start += 50) {
    await d1.batch(statements.slice(start, start + 50));
  }
}

function plainTextToHtml(value: string): string {
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br>')}</p>`)
    .join('');
}
