export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export function hasGmailSendScope(scopes: string | null | undefined): boolean {
  return new Set((scopes ?? '').split(/\s+/).filter(Boolean)).has(GMAIL_SEND_SCOPE);
}

export function gmailAccountHealth(input: {
  scopes: string;
  tokenExpiresAt: Date;
  refreshTokenCiphertext: string | null;
}): { canSend: boolean; status: 'READY' | 'RECONNECT'; message: string } {
  if (!hasGmailSendScope(input.scopes)) {
    return {
      canSend: false,
      status: 'RECONNECT',
      message: 'Gmail send permission is missing. Reconnect and approve the send permission.',
    };
  }
  if (input.tokenExpiresAt.getTime() <= Date.now() + 60_000 && !input.refreshTokenCiphertext) {
    return {
      canSend: false,
      status: 'RECONNECT',
      message: 'The Google session expired. Reconnect this account before sending.',
    };
  }
  return { canSend: true, status: 'READY', message: 'Ready to send' };
}
