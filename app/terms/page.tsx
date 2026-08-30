import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/app/components/public-chrome';
import { legal, legalHost } from '@/lib/legal/config';

export const metadata: Metadata = {
  title: 'Terms of service — Relay',
  description: 'The rules for using Relay to coordinate event outreach through your own Gmail account.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={`These terms are the agreement between you and ${legal.entityName} for the use of ${legal.serviceName} at ${legalHost()}. By creating an account, accepting an event invitation, or connecting a Gmail account, you accept them.`}
    >
      <LegalSection heading="1. The service">
        <p>
          Relay coordinates event outreach. Organizers create events, upload a participant list, and define mail tasks
          with a fixed recipient, subject, and body. Invited volunteers connect their own Gmail account, select one
          recipient set, and send one message for that set with the addresses in BCC.
        </p>
        <p>
          Relay is a sending tool, not an email provider. Delivery happens through your own Gmail account and is subject
          to Google&rsquo;s terms, quotas, and policies.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts and access">
        <ul>
          <li>You must be at least 13 years old and provide accurate account information.</li>
          <li>
            Signing in does not grant access to any event. Access comes only from an organizer&rsquo;s invitation link,
            which is scoped to a single event and expires.
          </li>
          <li>Do not share your account, your invitation links, or your Gmail credentials.</li>
          <li>You are responsible for everything sent from your account and from the Gmail accounts you connect.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <p>You agree not to use Relay to:</p>
        <ul>
          <li>
            send unsolicited bulk email. Only upload addresses you have a lawful basis to contact &mdash; for example
            people who registered for your event or opted in to your updates;
          </li>
          <li>
            send messages that are deceptive, that misrepresent the sender, or that omit a way to opt out where the law
            requires one;
          </li>
          <li>send content that is unlawful, harassing, hateful, fraudulent, or infringing;</li>
          <li>bypass Gmail sending limits, split lists across accounts to evade quotas, or automate the send button;</li>
          <li>contact an address that appears on the suppression list, or re-upload an address that asked to be removed;</li>
          <li>probe, scan, or attempt to gain unauthorized access to Relay or another user&rsquo;s data.</li>
        </ul>
        <p>
          You must comply with applicable anti-spam and data protection law (such as the CAN-SPAM Act, GDPR, and India&rsquo;s
          IT rules, as applicable to you) and with{' '}
          <a href="https://support.google.com/mail/answer/81126" target="_blank" rel="noreferrer">
            Google&rsquo;s sender guidelines
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="4. Organizer responsibilities">
        <p>
          If you upload a participant list, you confirm that you collected those addresses lawfully, that you are
          permitted to contact them for this purpose, and that you will honor removal requests. As between you and us,
          you are the controller of that list; we process it on your behalf to provide the service. You are responsible
          for the content of the mail tasks you create and for the volunteers you invite.
        </p>
      </LegalSection>

      <LegalSection heading="5. Google accounts">
        <p>
          Connecting a Gmail account authorizes Relay to send messages you initiate using the{' '}
          <code>gmail.send</code> scope. Relay never reads, modifies, or deletes your mail. You can withdraw this
          authorization at any time by disconnecting the account inside Relay or by removing Relay at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          . Our handling of Google data is described in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="6. Availability and changes">
        <p>
          Relay is provided as is and may change, be interrupted for maintenance, or be discontinued. We do not
          guarantee that a message will be accepted or delivered by Gmail or by a recipient&rsquo;s mail server. We may
          update these terms; continued use after an update means you accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Suspension and termination">
        <p>
          We may suspend or remove an account, an event, or a connected Gmail account that violates these terms, that
          generates spam complaints, or that puts the service or its users at risk. You may stop using Relay at any time
          and request deletion of your data as described in the privacy policy.
        </p>
      </LegalSection>

      <LegalSection heading="8. Disclaimer and liability">
        <p>
          To the maximum extent permitted by law, Relay is provided without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and non-infringement. We are not liable for
          indirect, incidental, special, or consequential damages, for lost profits or goodwill, or for messages that
          were not delivered, were delivered late, or were sent to the wrong recipients. Nothing here limits liability
          that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection heading="9. Indemnity">
        <p>
          You will indemnify {legal.entityName} against claims, losses, and expenses arising from lists you uploaded,
          messages you sent, or your breach of these terms or of applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law and contact">
        <p>
          These terms are governed by the laws of {legal.governingLaw}, without regard to conflict-of-law rules.
          Questions about these terms go to <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
