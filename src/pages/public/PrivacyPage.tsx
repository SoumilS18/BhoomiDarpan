import React from 'react';
import { ArrowRight } from 'lucide-react';
import {
  PageHero,
  PublicProseContainer,
  LegalSection,
  P,
  LegalUl,
  NoticeBox,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG, NOT_CONFIGURED_TEXT } from '../../lib/publicConfig';

const LAST_UPDATED = new Date().toLocaleDateString('en-IN', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/**
 * Privacy policy.
 *
 * HONESTY RULES
 *   * This is the application's own privacy policy. It is NOT described as
 *     legally reviewed, legally certified or regulator-approved, because it
 *     has not been.
 *   * No legal entity, data protection officer, ministry or postal address is
 *     invented. Contact details come from deployment configuration.
 *   * Every data category listed is one the platform actually stores.
 */
export const PrivacyPage: React.FC = () => {
  const loginPath = getRouteById('auth.login').path;

  return (
    <PublicPageLayout metaKey="privacy">
      <PageHero
        metaKey="privacy"
        eyebrow="Privacy Policy"
        lead="This policy explains what information the BhoomiSetu application collects, why it is used, who can see it, and how long it is kept."
      />

      <PublicProseContainer>
        <div className="py-6">
          <NoticeBox tone="warning" title="Status of this document">
            This is the application's privacy policy, written for the platform itself. It has not
            been reviewed by legal counsel and it does not claim compliance with any specific
            statute or certification scheme. It should be reviewed and adapted by the deploying
            organisation before being published as an institutional policy.
          </NoticeBox>
        </div>

        <LegalSection index={1} heading="Scope and status">
          <P>
            This policy applies to information processed by the BhoomiSetu application in the course
            of its function as a land acquisition intelligence and decision-support system. It
            covers the public website, the account pages, and the authenticated application.
          </P>
          <P>Last updated: {LAST_UPDATED}.</P>
        </LegalSection>

        <LegalSection index={2} heading="Information the application collects">
          <P>BhoomiSetu stores the following categories of information:</P>
          <LegalUl
            items={[
              <span>
                <strong>Account information</strong> — name, official email address, department,
                designation and the role assigned to the account.
              </span>,
              <span>
                <strong>Case and project information</strong> — case records, workflow stage
                instances, statuses, dates, priorities, compensation and measurement fields, and
                operational events raised against them.
              </span>,
              <span>
                <strong>Documents</strong> — statutory documents uploaded to a case, any text
                extracted from them, and the verification decisions officers record against those
                extractions.
              </span>,
              <span>
                <strong>Geospatial information</strong> — case boundaries, parcel geometry and the
                administrative geography (state, district, sub-district, village) selected using
                official LGD codes.
              </span>,
              <span>
                <strong>Disputes and objections</strong> — filings, hearing details, statutory
                provisions, stay-order status and resolution records.
              </span>,
              <span>
                <strong>Usage and operational information</strong> — audit entries recording who
                performed which material action and when, together with the role they held at the
                time.
              </span>,
              <span>
                <strong>Authentication information</strong> — managed by the configured
                authentication provider, including sign-in timestamps and session state stored in
                the browser so that a session survives a page reload.
              </span>,
            ]}
          />
        </LegalSection>

        <LegalSection index={3} heading="Why the information is used">
          <P>Information is processed for the following purposes:</P>
          <LegalUl
            items={[
              'Operating and maintaining acquisition case records and their statutory workflow',
              'Determining what an account may see and do, through role-based access control',
              'Producing analysis — risk, delay, bottleneck, root cause, impact and recommendations — from the record itself',
              'Recording an audit trail so decisions can be reconstructed later',
              'Notifying authorised users of overdue, blocked or high-risk conditions',
              'Aggregating case data into portfolio-level reporting for authorised viewers',
              'Securing the platform and investigating misuse',
            ]}
          />
          <P>
            The application does not use case content for advertising, profiling or any purpose
            unrelated to the functions listed above.
          </P>
        </LegalSection>

        <LegalSection index={4} heading="Who can see your information">
          <P>
            Access is governed by the role assigned to each account. Roles are resolved by the
            server on every request — they are not taken from the browser — and a route that your
            role does not permit will refuse the request even if you navigate to it directly.
          </P>
          <LegalUl
            items={[
              'Administrators can manage accounts, policies and system configuration',
              'Officers see the cases and projects their role is authorised for',
              'Viewers can read without modifying records',
              'Every material action is written to the audit trail with the actor and role',
            ]}
          />
          <P>
            Row-level security is enabled on core database tables. The policy set shipped with the
            current schema is permissive, so the API authorisation layer is the primary access
            control today; see the{' '}
            <Link to={getRouteById('public.security').path} className="font-medium text-gov-navy underline">
              security page
            </Link>{' '}
            for the full description.
          </P>
        </LegalSection>

        <LegalSection index={5} heading="External and third-party services">
          <P>
            BhoomiSetu integrates with external services for specific functions. Where a service is
            used, the corresponding data is transmitted to that provider by the server:
          </P>
          <LegalUl
            items={[
              'The authentication provider that manages sign-in and password recovery',
              'The database platform that hosts the application records',
              'Administrative geography services used to obtain the official LGD hierarchy',
              'Mapping and basemap providers used to render spatial context',
              'Open geocoding and road-routing services used for address and distance lookups',
              'Weather and observation services used for external context on a case',
              'Document processing and translation services, where configured',
            ]}
          />
          <P>
            Provider credentials are held server-side and are never placed in the browser bundle.
            Where a provider is unavailable or not configured, the application reports that status
            rather than substituting sample content.
          </P>
        </LegalSection>

        <LegalSection index={6} heading="Data retention">
          <P>
            Case records, documents, disputes and audit entries are retained as part of the case
            file they belong to, for as long as the deploying organisation requires them to support
            the statutory process and subsequent review.
          </P>
          <P>
            Retention periods are a matter for the deploying organisation. This application does not
            currently enforce an automated deletion schedule; administrators should define one
            before production use.
          </P>
        </LegalSection>

        <LegalSection index={7} heading="Security measures">
          <P>The application applies the following measures, as described in more detail on the security page:</P>
          <LegalUl
            items={[
              'Server-side verification of authentication tokens on every privileged request',
              'Role-based authorisation enforced on the server, never trusted from the client',
              'Provider and database credentials held server-side only',
              'Audit logging of material actions',
              'Server-side validation of request payloads and imported geometry',
              'Sanitisation of uploaded file names and constrained upload handling',
            ]}
          />
          <P>
            No system can be guaranteed free of security incidents. Users should use strong,
            unique credentials and report suspected vulnerabilities to their administrator.
          </P>
        </LegalSection>

        <LegalSection index={8} heading="Cookies and local storage">
          <P>
            The application uses browser storage to persist the authenticated session so that a user
            is not required to sign in on every page load, and to retain navigation state such as
            open workspace tabs and filters encoded in the URL.
          </P>
          <LegalUl
            items={[
              'Session storage is used by the configured authentication provider to restore a session',
              'Filter and tab state is stored in the URL so a view can be shared or reloaded',
              'The application does not set advertising or cross-site tracking cookies',
            ]}
          />
        </LegalSection>

        <LegalSection index={9} heading="Information you submit">
          <P>
            Content entered into the application — case detail, documents, dispute descriptions,
            survey notes and similar — is submitted by authorised users in the course of their
            duties. Users should only submit information they are authorised to handle.
          </P>
          <P>
            The public website does not accept submissions through a contact form in this
            deployment. See the{' '}
            <Link to={getRouteById('public.contact').path} className="font-medium text-gov-navy underline">
              contact page
            </Link>{' '}
            for configured contact details.
          </P>
        </LegalSection>

        <LegalSection index={10} heading="Your rights and requests">
          <P>Subject to your organisation's policies, you may ask your administrator to:</P>
          <LegalUl
            items={[
              'Confirm whether an account exists and what role it holds',
              'Correct inaccurate account or case information',
              'Provide a copy of the audit entries associated with your actions',
              'Suspend or withdraw access to your account',
            ]}
          />
          <P>
            Requests are handled by the deployment administrator. Contact details are configured on
            the{' '}
            <Link to={getRouteById('public.contact').path} className="font-medium text-gov-navy underline">
              contact page
            </Link>
            . Current configured contact:{' '}
            <span className="font-medium text-gov-slate">
              {PUBLIC_CONFIG.contact.email ?? NOT_CONFIGURED_TEXT}
            </span>
            .
          </P>
        </LegalSection>

        <LegalSection index={11} heading="Children">
          <P>
            BhoomiSetu is an operational system for authorised adult professionals. It is not
            directed at children and is not intended to be used by them.
          </P>
        </LegalSection>

        <LegalSection index={12} heading="Changes to this policy">
          <P>
            This policy may be updated when the application's functionality or the deploying
            organisation's requirements change. The "last updated" date at the top of the page
            reflects the current version. Material changes should be communicated to account holders
            by the administrator.
          </P>
        </LegalSection>

        <LegalSection index={13} heading="Contact">
          <P>
            For questions about this policy or about your information, contact the administrator of
            this deployment.
          </P>
          <P>
            <strong>Email:</strong>{' '}
            {PUBLIC_CONFIG.contact.email ?? NOT_CONFIGURED_TEXT}
            <br />
            <strong>Point of contact:</strong>{' '}
            {PUBLIC_CONFIG.contact.pointOfContact ?? NOT_CONFIGURED_TEXT}
            <br />
            <strong>Postal address:</strong>{' '}
            {PUBLIC_CONFIG.contact.postalAddress ?? NOT_CONFIGURED_TEXT}
          </P>
          <P>
            No legal entity, registration details or regulatory contact has been invented for this
            page. Deploying organisations should insert their own institutional details here before
            publishing.
          </P>
        </LegalSection>

        <div className="py-8">
          <Link
            to={loginPath}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
          >
            Back to Sign In
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicProseContainer>
    </PublicPageLayout>
  );
};

export default PrivacyPage;
