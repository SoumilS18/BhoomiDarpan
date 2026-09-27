import React from 'react';
import { ArrowRight, Mail, MapPin, UserRound, Info } from 'lucide-react';
import {
  PageHero,
  PublicSection,
  CtaBand,
  NoticeBox,
  PublicCard,
  IconPlate,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG, NOT_CONFIGURED_TEXT } from '../../lib/publicConfig';

/**
 * Contact page.
 *
 * HONESTY RULES
 *   * Contact *information* is deployment configuration. Absent values render
 *     as "not configured" — no mailbox, address or person is invented.
 *   * There is no contact-form submission endpoint in this deployment, so no
 *     form is rendered. The page says so explicitly rather than presenting a
 *     form that silently goes nowhere.
 */
export const ContactPage: React.FC = () => {
  const contact = PUBLIC_CONFIG.contact;
  const requestPath = getRouteById('auth.requestAccess').path;
  const securityPath = getRouteById('public.security').path;

  return (
    <PublicPageLayout metaKey="contact">
      <PageHero
        metaKey="contact"
        lead="How to reach the administrator of this BhoomiSetu deployment, and how to ask for an account."
      />

      <PublicSection eyebrow="Contact information" title="Configured for this deployment" tone="white">
        <div className="grid gap-5 md:grid-cols-3">
          <PublicCard
            icon={<IconPlate tone="navy"><Mail className="h-5 w-5" /></IconPlate>}
            title="Email"
            description={contact.email ?? NOT_CONFIGURED_TEXT}
          />
          <PublicCard
            icon={<IconPlate tone="blue"><UserRound className="h-5 w-5" /></IconPlate>}
            title="Point of contact"
            description={contact.pointOfContact ?? NOT_CONFIGURED_TEXT}
          />
          <PublicCard
            icon={<IconPlate tone="slate"><MapPin className="h-5 w-5" /></IconPlate>}
            title="Postal address"
            description={contact.postalAddress ?? NOT_CONFIGURED_TEXT}
          />
        </div>

        <div className="mt-5">
          <NoticeBox tone="info" title="These values are configuration, not placeholders">
            Where a value above is not configured, it has deliberately been left empty. No mailbox,
            department or address has been invented to fill the space.
          </NoticeBox>
        </div>
      </PublicSection>

      <PublicSection
        eyebrow="Contact form"
        title="Form submission is not connected"
        lead="This deployment does not expose an endpoint that accepts and delivers messages from a public contact form, so no form is shown here. Presenting one would imply a delivery path that does not exist."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gov-slate">
              <Info className="h-4 w-4 text-gov-navy" aria-hidden="true" />
              Contact information vs form submission
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              <li>
                <span className="font-medium text-gov-slate">Contact information</span> is shown above
                and is accurate for this deployment.
              </li>
              <li>
                <span className="font-medium text-gov-slate">Contact form submission</span> requires a
                server-side delivery workflow, which does not exist here. Nothing would be sent.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
            <h3 className="text-base font-semibold text-gov-slate">If you need an account</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Account provisioning is handled by your deployment's administrator. The access request
              page lists exactly what an administrator needs in order to issue one.
            </p>
            <Link
              to={requestPath}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
            >
              Go to request access
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-5">
          <NoticeBox tone="warning" title="Security matters">
            Report suspected vulnerabilities through your deployment's administrator rather than a
            public channel. The{' '}
            <Link to={securityPath} className="font-medium underline">
              security page
            </Link>{' '}
            describes the controls in place.
          </NoticeBox>
        </div>
      </PublicSection>

      <CtaBand
        title="Looking for something else?"
        description="The access request page explains account provisioning, and the security page explains how access is controlled."
        primaryLabel="Request Access"
        primaryTo={requestPath}
        secondaryLabel="Security"
        secondaryTo={securityPath}
      />
    </PublicPageLayout>
  );
};

export default ContactPage;
