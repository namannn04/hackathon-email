/**
 * Values shown on the public home, privacy, and terms pages. Google's OAuth
 * consent screen links to those pages, so keep them accurate for the deployed
 * origin. Override the contact/legal details with environment variables.
 */
export const legal = {
  serviceName: 'Relay',
  lastUpdated: '30 August 2026',
  contactEmail: process.env.RELAY_CONTACT_EMAIL ?? 'support@example.com',
  entityName: process.env.RELAY_LEGAL_ENTITY ?? 'the Relay team',
  governingLaw: process.env.RELAY_GOVERNING_LAW ?? 'India',
  siteOrigin: process.env.SITE_ORIGIN ?? 'http://localhost:3000',
} as const;

export function legalHost(): string {
  try {
    return new URL(legal.siteOrigin).host;
  } catch {
    return legal.siteOrigin;
  }
}
