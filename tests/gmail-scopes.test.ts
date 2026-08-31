import { describe, expect, it } from 'vitest';
import { GMAIL_SEND_SCOPE, gmailAccountHealth, hasGmailSendScope } from '@/lib/gmail/scopes';

describe('Gmail account permissions', () => {
  it('requires the exact Gmail send scope', () => {
    expect(hasGmailSendScope(`openid email ${GMAIL_SEND_SCOPE} profile`)).toBe(true);
    expect(hasGmailSendScope('openid email profile')).toBe(false);
    expect(hasGmailSendScope('gmail.send')).toBe(false);
  });

  it('marks missing permission and expired non-refreshable sessions for reconnect', () => {
    expect(gmailAccountHealth({ scopes: 'openid email', tokenExpiresAt: new Date(Date.now() + 60_000), refreshTokenCiphertext: 'token' }).canSend).toBe(false);
    expect(gmailAccountHealth({ scopes: GMAIL_SEND_SCOPE, tokenExpiresAt: new Date(0), refreshTokenCiphertext: null }).canSend).toBe(false);
    expect(gmailAccountHealth({ scopes: GMAIL_SEND_SCOPE, tokenExpiresAt: new Date(0), refreshTokenCiphertext: 'token' }).canSend).toBe(true);
  });
});
