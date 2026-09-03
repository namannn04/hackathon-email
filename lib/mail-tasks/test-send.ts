import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { getPrisma } from '@/lib/db/prisma';
import { compileEmailBody, type ImagePlacement } from '@/lib/email-html/document';
import { sendRawGmailMessage } from '@/lib/gmail/client';
import { gmailAccountHealth } from '@/lib/gmail/scopes';
import { usesMockTransport } from '@/lib/gmail/transport';
import { HttpError } from '@/lib/http';
import { buildGmailMime } from '@/lib/sending/mime';
import { buildUnsubscribeUrl, createUnsubscribeToken } from '@/lib/unsubscribe/token';
import type { ComposedImage } from './form';

/**
 * Sends the composed message to the organizer's own address, through the same
 * compiler, the same MIME builder and the same Gmail call a real set uses. It
 * is the one way to confirm that what the preview shows is what an inbox
 * receives, since a mail client — not a browser — has the final say.
 *
 * The organizer is always the only recipient and there is no Bcc, so this
 * cannot reach a participant. Nothing is persisted beyond an audit entry: no
 * mail task, no set, no send record.
 */
export async function sendTestEmail(input: {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  images?: ComposedImage[];
  imagePlacement?: ImagePlacement;
  gmailAccountId: string;
  origin: string;
}, user: User) {
  if (!user.email) {
    throw new HttpError(400, 'Your account has no email address to send a test to.', 'NO_TEST_RECIPIENT');
  }

  const gmail = await getPrisma().gmailAccount.findFirst({
    where: { id: input.gmailAccountId, userId: user.id, revokedAt: null },
  });
  if (!gmail) {
    throw new HttpError(404, 'Connect and choose one of your Gmail accounts.', 'GMAIL_ACCOUNT_REQUIRED');
  }

  const images = (input.images ?? []).map((image, index) => ({ ...image, contentId: `image${index + 1}` }));
  // A token for a task that does not exist: the footer and header look exactly
  // as they will, and the page tells a curious clicker the link is not valid.
  const testId = crypto.randomUUID();
  const unsubscribeUrl = buildUnsubscribeUrl(input.origin, await createUnsubscribeToken(`test-${testId.replaceAll('-', '')}`));
  const body = compileEmailBody({
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
    contentIds: images.map((image) => image.contentId),
    placement: input.imagePlacement,
    unsubscribeUrl,
  });

  if (usesMockTransport()) {
    return {
      delivered: false,
      mockTransport: true,
      recipient: user.email,
      from: gmail.email,
      htmlWarnings: body.warnings,
    };
  }

  const health = gmailAccountHealth(gmail);
  if (!health.canSend) throw new HttpError(409, health.message, 'GMAIL_RECONNECT_REQUIRED');

  const raw = buildGmailMime({
    sender: gmail.email,
    to: user.email,
    recipients: [],
    subject: input.subject,
    bodyText: body.text,
    bodyHtml: body.html,
    messageId: `<relay.test.${testId}@relay.internal>`,
    batchId: testId,
    images,
    unsubscribeUrl,
  });
  const sent = await sendRawGmailMessage({ accountId: gmail.id, userId: user.id, raw });

  await writeAudit({
    actorId: user.id,
    action: 'TEST_EMAIL_SENT',
    entityType: 'gmail_account',
    entityId: gmail.id,
    metadata: { recipient: user.email, subject: input.subject, images: images.length },
  });

  return {
    delivered: true,
    mockTransport: false,
    recipient: user.email,
    from: gmail.email,
    providerMessageId: sent.id,
    htmlWarnings: body.warnings,
  };
}
