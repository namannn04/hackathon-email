import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { HttpError } from '@/lib/http';

export async function requireAppUser(): Promise<User> {
  const identity = await getChatGPTUser();
  if (!identity) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const email = identity.email.toLowerCase();
  const organizerEmails = (process.env.RELAY_ORGANIZER_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowLocalBootstrap = organizerEmails.length === 0 && process.env.NODE_ENV !== 'production';
  const configuredRole = organizerEmails.includes(email) ? 'ORGANIZER' : 'VOLUNTEER';
  const result = await getD1()
    .prepare(
      `INSERT INTO users (id, external_id, email, name, role, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4,
              CASE
                WHEN ?6 = 1 AND NOT EXISTS (SELECT 1 FROM users) THEN 'ORGANIZER'
                ELSE ?7
              END,
              ?5, ?5
       ON CONFLICT(external_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         role = CASE WHEN excluded.role = 'ORGANIZER' THEN 'ORGANIZER' ELSE users.role END,
         updated_at = excluded.updated_at
       RETURNING id, external_id AS externalId, email, name, role,
                 created_at AS createdAt, updated_at AS updatedAt`,
    )
    .bind(id, identity.userId, email, identity.fullName, now, allowLocalBootstrap ? 1 : 0, configuredRole)
    .first<User>();

  if (!result) throw new HttpError(500, 'Could not establish your Relay account.', 'USER_SYNC_FAILED');
  return result;
}

export async function requireOrganizer(): Promise<User> {
  const user = await requireAppUser();
  if (user.role !== 'ORGANIZER') {
    throw new HttpError(403, 'Only organizers can manage events.', 'ORGANIZER_REQUIRED');
  }
  return user;
}
