import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { HttpError } from '@/lib/http';

export async function requireAppUser(): Promise<User> {
  const identity = await getChatGPTUser();
  if (!identity) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const result = await getD1()
    .prepare(
      `INSERT INTO users (id, external_id, email, name, role, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4,
              CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'ORGANIZER' ELSE 'VOLUNTEER' END,
              ?5, ?5
       ON CONFLICT(external_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         updated_at = excluded.updated_at
       RETURNING id, external_id AS externalId, email, name, role,
                 created_at AS createdAt, updated_at AS updatedAt`,
    )
    .bind(id, identity.userId, identity.email.toLowerCase(), identity.fullName, now)
    .first<User>();

  if (!result) throw new HttpError(500, 'Could not establish your Relay account.', 'USER_SYNC_FAILED');
  return result;
}

export async function requireOrganizer(): Promise<User> {
  const user = await requireAppUser();
  if (user.role !== 'ORGANIZER') {
    throw new HttpError(403, 'Only organizers can manage campaigns.', 'ORGANIZER_REQUIRED');
  }
  return user;
}
