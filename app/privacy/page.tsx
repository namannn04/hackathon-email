import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/app/components/public-chrome';
import { legal, legalHost } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Privacy policy — Relay',
  description: 'How Relay collects, uses, stores, and deletes data, including data received from Google APIs.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`This policy explains what ${legal.serviceName} (“we”, “us”) collects when you use ${legalHost()}, why we collect it, how long we keep it, and how you can remove it. It also contains our disclosure for data received through Google APIs.`}
    >
      <LegalSection heading="1. What Relay is">
        <p>
          Relay is a coordination tool for event and hackathon outreach. An organizer creates an event, uploads the
          participant email list once, and defines mail tasks with a fixed recipient, subject, and body. Invited
          volunteers sign in, connect their own Gmail account, select one recipient set, and send exactly one message
          for that set. Every address in a set is placed in <strong>BCC</strong>, so recipients never see each other.
        </p>
        <p>
          Relay never composes, edits, or sends anything on its own. A message leaves your mailbox only when you press
          send in the application.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <ul>
          <li>
            <strong>Account information.</strong> Sign-in is handled by Neon Auth. We store the account identifier,
            email address, and display name it returns, plus your role (organizer or volunteer) and which events you
            were invited to.
          </li>
          <li>
            <strong>Google account information.</strong> When you connect a Gmail account, we store the Google account
            identifier (<code>sub</code>), the account&rsquo;s email address, and its display name, so the interface can
            show you which mailbox will be used.
          </li>
          <li>
            <strong>Google OAuth tokens.</strong> We store the access token and, where Google issues one, the refresh
            token for each connected Gmail account, together with the granted scopes and expiry time. Tokens are
            encrypted before being written to the database.
          </li>
          <li>
            <strong>Event participant lists.</strong> Organizers upload CSV or XLSX files containing recipient email
            addresses. We store those addresses, a normalized form used for deduplication and suppression, and their
            per-mail-task delivery status.
          </li>
          <li>
            <strong>Mail task content.</strong> The fixed <code>To</code> address, subject, and body written by the
            organizer.
          </li>
          <li>
            <strong>Sending and activity records.</strong> For each send we record who sent it, which set and mail task
            it belonged to, which connected Gmail account was used, the recipient count, the timestamp, the resulting
            status, and any error returned by Gmail. We also keep an audit log of administrative actions such as
            connecting an account, creating an invitation, or adding a suppression.
          </li>
          <li>
            <strong>Suppressions.</strong> Email addresses that must never be contacted again, with the reason recorded.
          </li>
        </ul>
        <p>
          We do not run advertising or third-party analytics trackers, and we do not build advertising profiles.
        </p>
      </LegalSection>

      <LegalSection heading="3. Google API scopes and how we use them">
        <p>When you connect a Gmail account, Relay requests only these scopes:</p>
        <ul>
          <li>
            <code>openid</code>, <code>email</code>, <code>profile</code> &mdash; to confirm which Google account you
            connected and display its address in the interface.
          </li>
          <li>
            <code>https://www.googleapis.com/auth/gmail.send</code> &mdash; to send the message you explicitly chose to
            send, using the organizer&rsquo;s fixed subject and body and the addresses in the set you selected.
          </li>
        </ul>
        <p>
          Relay does <strong>not</strong> request permission to read, search, modify, label, or delete your mail, and it
          does not access your contacts, Drive, or Calendar. Each send is one Gmail API call for one message that you
          initiated. Relay does not send on a schedule and does not send in the background.
        </p>
      </LegalSection>

      <LegalSection heading="4. Limited Use disclosure">
        <p>
          Relay&rsquo;s use and transfer of information received from Google APIs to any other app adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>Specifically, data obtained through Google APIs is:</p>
        <ul>
          <li>used only to provide and improve the sending features described in this policy;</li>
          <li>never sold, rented, or transferred for advertising, credit assessment, or lending purposes;</li>
          <li>never used to train generalized artificial intelligence or machine learning models;</li>
          <li>
            never read by a human, except with your explicit consent, when required to investigate a security incident
            or abuse report, when required by law, or when the data has been aggregated and de-identified.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. How we share information">
        <p>We do not sell your data. We share it only with the service providers that make Relay work:</p>
        <ul>
          <li><strong>Neon</strong> &mdash; managed PostgreSQL database and authentication.</li>
          <li><strong>Google</strong> &mdash; the Gmail API, which delivers the messages you send.</li>
          <li><strong>Our hosting provider</strong> &mdash; serves the application and processes requests in transit.</li>
        </ul>
        <p>
          Within Relay, an organizer can see the participant list for their own event and the send activity of
          volunteers on that event. Volunteers see only the events they were invited to. Sign-in alone grants no access
          to any event; access comes only from an organizer&rsquo;s invitation link.
        </p>
        <p>We may also disclose information where required by law or to protect against fraud or abuse.</p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          Traffic is served over HTTPS. Google OAuth tokens are encrypted with an application key before storage, and
          the OAuth flow uses PKCE with single-use, expiring state values. Invitation links are stored only as hashes.
          Sends use idempotency keys, expiring leases, and deterministic message identifiers to protect normal retries
          and concurrent clicks. Ambiguous provider or network failures remain visible for review before retrying.
        </p>
        <p>
          No system is perfectly secure. If you believe an account or list has been exposed, contact us at{' '}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection heading="7. Retention and deletion">
        <ul>
          <li>
            <strong>Disconnect a Gmail account.</strong> Open <strong>Gmail &amp; history</strong> in the application
            and disconnect the account. Its stored tokens stop being usable immediately.
          </li>
          <li>
            <strong>Revoke access from Google.</strong> You can remove Relay at any time from{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>
            . Revocation takes effect at Google immediately.
          </li>
          <li>
            <strong>Participant lists.</strong> Deleting an event deletes its participant list, its mail tasks, and
            their delivery records.
          </li>
          <li>
            <strong>Account deletion.</strong> Email <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>{' '}
            from your registered address and we will delete your account and connected Gmail credentials within 30 days.
          </li>
          <li>
            <strong>Logs.</strong> Send activity and audit records are kept while the event exists so organizers can see
            what was sent and avoid duplicate outreach, and suppression entries are kept so an address that asked not to
            be contacted stays excluded.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Recipients of email sent through Relay">
        <p>
          If you received a message sent through Relay and want your address removed, reply to that message or write to{' '}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. We will add the address to the suppression
          list so it is excluded from future sets. The organizer who uploaded the list is responsible for how that list
          was collected.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>
          Relay is not directed at children under 13, and we do not knowingly collect their information. If you believe
          a child has created an account, contact us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes and contact">
        <p>
          If this policy changes materially, we will update the date at the top of this page and, where reasonable,
          notify organizers by email. Questions, deletion requests, and privacy complaints go to{' '}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>, addressed to {legal.entityName}.
        </p>
        <p>
          See also our <Link href="/terms">terms of service</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
