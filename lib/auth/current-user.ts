import type { User } from '@/generated/prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http';
import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon';

export async function requireAppUser(): Promise<User> {
  if (!isNeonAuthConfigured()) throw new HttpError(503, 'Neon Auth is not configured yet.', 'AUTH_NOT_CONFIGURED');
  const { data: session, error } = await getNeonAuth().getSession();
  if (error || !session?.user) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');
  const identity = session.user;
  if (!identity.email || !identity.emailVerified) {
    throw new HttpError(403, 'A verified email address is required.', 'VERIFIED_EMAIL_REQUIRED');
  }

  const email = identity.email.toLowerCase();
  const isOrganizer = organizerEmails().includes(email);
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ authUserId: identity.id }, { email }] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        authUserId: identity.id,
        name: identity.name,
        role: isOrganizer ? 'ORGANIZER' : 'VOLUNTEER',
      },
    });
  }

  return prisma.user.create({
    data: {
      authUserId: identity.id,
      email,
      name: identity.name,
      role: isOrganizer ? 'ORGANIZER' : 'VOLUNTEER',
    },
  });
}

export async function requireOrganizer(): Promise<User> {
  const user = await requireAppUser();
  if (user.role !== 'ORGANIZER') {
    throw new HttpError(403, 'Only organizers can manage events.', 'ORGANIZER_REQUIRED');
  }
  return user;
}

function organizerEmails(): string[] {
  return (process.env.RELAY_ORGANIZER_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
