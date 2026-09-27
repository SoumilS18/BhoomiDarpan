import React from 'react';
import { ArrowRight, Scale } from 'lucide-react';
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
 * Terms of use.
 *
 * HONESTY RULES
 *   * Not described as lawyer-reviewed, certified or regulator-approved.
 *   * No legal entity, address or ministry is invented.
 *   * Decision-support limitations are stated explicitly, because the platform
 *     produces predictions and recommendations.
 */
export const TermsPage: React.FC = () => {
  const loginPath = getRouteById('auth.login').path;

  return (
    <PublicPageLayout metaKey="terms">
      <PageHero
        metaKey="terms"
        eyebrow="Terms of Use"
        lead="Conditions that apply when accessing and using the BhoomiSetu platform."
      />

      <PublicProseContainer>
        <div className="py-6">
          <NoticeBox tone="warning" title="Status of this document">
            These terms are the application's own terms of use. They have not been reviewed by legal
            counsel and do not constitute a legal agreement between any named parties. The deploying
            organisation should adapt and approve them before institutional use.
          </NoticeBox>
        </div>

        <div className="pb-6">
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
            <div className="mt-0.5 shrink-0">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Decision-support disclaimer</h2>
              <p className="mt-1.5 text-sm leading-relaxed">
                BhoomiSetu is a decision-support system. Its predictions, risk assessments,
                bottleneck analyses, root-cause classifications and recommendations are{' '}
                <strong>estimates and proposals generated from the data available to it</strong>.
                They do not automatically replace authorised human, legal or administrative
                decisions, and they must not be treated as determinations of fact. Statutory and
                legal decisions remain with the officers and authorities empowered to make them.
              </p>
            </div>
          </div>
        </div>

        <LegalSection index={1} heading="Acceptable use">
          <P>
            You may use BhoomiSetu only for lawful work related to land acquisition, revenue,
            project management, legal review or the administration of the platform itself.
          </P>
          <LegalUl
            items={[
              'Access the records your assigned role authorises you to access',
              'Enter information you are entitled to enter, accurately and in good faith',
              'Use exported or screenshotted content in accordance with your organisation’s rules',
              'Report suspected defects, data inaccuracies or security issues to your administrator',
            ]}
          />
        </LegalSection>

        <LegalSection index={2} heading="Authorised access">
          <P>
            Accounts are issued by the deployment's administrator. Access is limited to the scope of
            the role assigned to your account, and that scope is determined by the server on every
            request.
          </P>
          <LegalUl
            items={[
              'You must not share your credentials with another person',
              'You must not attempt to access records or functions outside your role, including by altering URLs or request parameters',
              'You must not use another person’s identity, or a non-production role context, to perform an action',
              'You must promptly report any suspected unauthorised access to your administrator',
            ]}
          />
        </LegalSection>

        <LegalSection index={3} heading="Account responsibilities">
          <P>
            You are responsible for activity performed under your account. Keep credentials
            confidential, sign out on shared devices, and notify the administrator if you believe
            your account has been compromised or is no longer required for your duties.
          </P>
        </LegalSection>

        <LegalSection index={4} heading="Data accuracy">
          <P>
            BhoomiSetu records and analyses the information entered into it. It does not independently
            verify that an entered measurement, date, name or boundary is factually correct.
          </P>
          <LegalUl
            items={[
              'Outputs are only as accurate as their inputs',
              'Where the platform detects inconsistency between sources it flags it rather than silently choosing one',
              'Externally sourced data carries freshness metadata and may be stale when displayed',
              'Users should confirm material values against the underlying record before relying on them',
            ]}
          />
        </LegalSection>

        <LegalSection index={5} heading="Information you submit">
          <P>
            You are responsible for the content you enter: case details, documents, dispute
            descriptions, notes and geometry. You must be authorised to submit that content and must
            not enter material you are not permitted to handle.
          </P>
          <P>
            Submitted content becomes part of the case record, is visible to other authorised users
            of that case, and is retained as part of the audit trail.
          </P>
        </LegalSection>

        <LegalSection index={6} heading="GIS and spatial limitations">
          <LegalUl
            items={[
              'Boundary and parcel geometry entered by users may be approximate and is not a substitute for a certified survey',
              'Thematic and basemap overlays supplied by external services are visual context, not measurement, and are not derived from the case record',
              'Administrative boundaries reflect the official hierarchy available at the time of retrieval and may change',
              'Map rendering depends on external providers that may be unavailable or rate-limited',
            ]}
          />
        </LegalSection>

        <LegalSection index={7} heading="AI-generated analysis limitations">
          <P>
            Where an AI provider is configured, the platform may extract fields from documents or
            produce textual interpretation of case context. Such output is marked for verification
            and may be incomplete, incorrect or misread.
          </P>
          <LegalUl
            items={[
              'Machine-extracted values are proposals until an officer accepts them',
              'Interpretation text must be checked against the underlying document before being relied upon',
              'Where no provider is configured, the platform reports that status rather than substituting generic text',
              'AI-assisted interpretation is labelled distinctly from observed fact in the evidence ledger',
            ]}
          />
        </LegalSection>

        <LegalSection index={8} heading="Predictive estimates">
          <P>
            Projections of delay, risk bands and completion windows are computed from observed
            behaviour and stated assumptions. They are not forecasts of certainty, and they do not
            account for events that have not yet occurred.
          </P>
          <P>
            A projected date should never be represented as a commitment. Where such estimates are
            quoted onward in reports or correspondence, their estimated nature should be stated
            alongside them.
          </P>
        </LegalSection>

        <LegalSection index={9} heading="Document processing limitations">
          <P>
            Document processing is an aid to review, not a substitute for reading the document.
            Classification, extraction and validation results must be confirmed by an authorised
            officer before they are treated as correct.
          </P>
        </LegalSection>

        <LegalSection index={10} heading="Third-party services">
          <P>
            The platform depends on external providers for authentication, storage, geography,
            mapping, routing, observation and — where configured — document processing and
            translation. Availability, accuracy and rate limits of those services are outside the
            platform's control, and the interface reports their status when they degrade.
          </P>
        </LegalSection>

        <LegalSection index={11} heading="Prohibited use">
          <LegalUl
            items={[
              'Attempting to gain unauthorised access to records, accounts or the underlying systems',
              'Interfering with the platform, including overloading, scraping at scale, or bypassing rate controls',
              'Introducing malicious code, or attempting to extract provider credentials or database details',
              'Using the platform for any unlawful purpose or to harass any person',
              'Representing platform output as an official determination when it is an estimate',
              'Removing or obscuring provenance, freshness or decision-support notices from output',
            ]}
          />
        </LegalSection>

        <LegalSection index={12} heading="Security">
          <P>
            Reasonable technical controls are applied as described on the{' '}
            <Link to={getRouteById('public.security').path} className="font-medium text-gov-navy underline">
              security page
            </Link>
            . No system can be guaranteed secure, and use of the platform is subject to that
            understanding.
          </P>
        </LegalSection>

        <LegalSection index={13} heading="Suspension and termination">
          <P>
            An administrator may suspend or withdraw access at any time, including where access is no
            longer required for duties, where credentials are suspected of compromise, or where use
            of the platform appears to breach these terms.
          </P>
          <P>
            Suspension of an account does not delete case records; those remain part of the
            institution's file.
          </P>
        </LegalSection>

        <LegalSection index={14} heading="Intellectual property">
          <P>
            The BhoomiSetu application, its interface and its source are software owned by the
            project and its contributors. Institutional case data, documents and spatial records
            entered into the platform remain the property of the deploying organisation.
          </P>
          <P>
            Third-party components and data remain subject to their own licence terms, including
            open data and open mapping licences used for geographic context.
          </P>
        </LegalSection>

        <LegalSection index={15} heading="Limitation of liability">
          <P>
            The platform is provided on an "as is" and "as available" basis. To the maximum extent
            permitted, the developers and the deploying organisation are not liable for decisions
            taken, or not taken, on the basis of platform output; for inaccuracy arising from
            incomplete, incorrect or stale input data; or for unavailability of external providers.
          </P>
          <P>
            Nothing in these terms excludes liability that cannot lawfully be excluded. Nothing in
            these terms creates a legal relationship between the platform's developers and any user.
          </P>
        </LegalSection>

        <LegalSection index={16} heading="Changes to these terms">
          <P>
            These terms may be updated as the platform or the deployment's requirements change. The
            "last updated" date at the top of the page indicates the current version. Continued use
            after an update constitutes acceptance of the revised terms by the deploying
            organisation.
          </P>
        </LegalSection>

        <LegalSection index={17} heading="Contact">
          <P>
            Questions about these terms should be directed to the administrator of this deployment:{' '}
            <span className="font-medium text-gov-slate">
              {PUBLIC_CONFIG.contact.email ?? NOT_CONFIGURED_TEXT}
            </span>
            .
          </P>
          <P>
            No legal entity, registered address or regulatory contact has been invented for this
            page.
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

export default TermsPage;
