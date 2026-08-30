import { getD1 } from '@/db';

export function auditStatement(input: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  return getD1()
    .prepare(
      `INSERT INTO audit_events
       (id, actor_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
    );
}

export async function writeAudit(input: Parameters<typeof auditStatement>[0]) {
  await auditStatement(input).run();
}
