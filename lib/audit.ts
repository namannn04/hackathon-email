import { Prisma } from '@/generated/prisma/client';
import { getPrisma } from '@/lib/db/prisma';

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(input: AuditInput) {
  return getPrisma().auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
