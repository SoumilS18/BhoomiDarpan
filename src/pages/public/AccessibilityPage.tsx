import React from 'react';
import { ArrowRight, CheckCircle2, Keyboard, MonitorSmartphone, Type } from 'lucide-react';
import {
  PageHero,
  PublicSection,
  PublicGrid,
  PublicCard,
  CtaBand,
  IconPlate,
  PublicList,
  NoticeBox,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG, NOT_CONFIGURED_TEXT } from '../../lib/publicConfig';

const APPROACH: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <Keyboard className="h-5 w-5" />,
    title: 'Keyboard operation',
    body: 'Navigation, forms, dialogs, filters and tables can be operated without a pointing device. Interactive elements are real buttons, links, inputs and selects rather than clickable containers.',
  },
  {
    icon: <Type className="h-5 w-5" />,
    title: 'Labels and semantics',
    body: 'Every input is associated with a label, errors are announced through alert roles, and status changes are exposed through live regions for screen readers.',
  },
  {
    icon: <MonitorSmartphone className="h-5 w-5" />,
    title: 'Responsive layouts',
    body: 'Public, account and application pages reflow across desktop, laptop, tablet and mobile widths, with navigation collapsing into a menu rather than overflowing.',
  },
];

export const AccessibilityPage: React.FC = () => {
  const contactPath = getRouteById('public.contact').path;
  const loginPath = getRouteById('auth.login').path;

  return (
    <PublicPageLayout metaKey="accessibility">
      <PageHero
        metaKey="accessibility"
        eyebrow="Accessibility"
        lead="The approach applied to the BhoomiDarpan interface, and what is and is not claimed about it."
      />

      <PublicSection eyebrow="Status" title="No conformance claim is made" tone="white">
        <NoticeBox tone="warning" title="We do not claim WCAG conformance">
          This page has not been assessed against WCAG 2.1 AA by an independent evaluator, so
          BhoomiDarpan does not claim conformance with any accessibility standard. The statements
          below describe deliberate implementation choices, not a certified result. A conformance
          audit should be commissioned before any compliance claim is published.
        </NoticeBox>
      </PublicSection>

      <PublicSection eyebrow="Approach" title="What the interface deliberately does">
        <PublicGrid cols={3}>
          {APPROACH.map((item) => (
            <PublicCard key={item.title} icon={<IconPlate tone="navy">{item.icon}</IconPlate>} title={item.title}>
              {item.body}
            </PublicCard>
          ))}
        </PublicGrid>
      </PublicSection>

      <PublicSection eyebrow="Practices" title="Specific measures in the code" tone="white">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-gov-slate">Structure and navigation</h3>
            <div className="mt-3">
              <PublicList
                items={[
                  'A skip-to-content link on public and account pages',
                  'Semantic landmarks: header, main, footer and labelled navigation regions',
                  'Page titles updated to reflect the current surface',
                  'Real anchor elements for links, so open-in-new-tab and copy-link behave natively',
                  'Registry-driven navigation, so a destination cannot drift from its label',
                ]}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gov-slate">Forms and feedback</h3>
            <div className="mt-3">
              <PublicList
                items={[
                  'Labels bound to controls by id, with required fields marked visually and programmatically',
                  'Validation errors linked through aria-describedby and announced with role="alert"',
                  'Loading states announced through role="status"',
                  'Buttons disabled during submission so an action cannot be fired twice',
                  'Password visibility toggles exposed as pressed/unpressed states',
                ]}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gov-slate">Visual presentation</h3>
            <div className="mt-3">
              <PublicList
                items={[
                  'A visible focus ring applied globally to keyboard-focused elements',
                  'Status conveyed by text as well as colour, so colour is never the only signal',
                  'Body text and controls sized for legibility on dense operational screens',
                  'Motion reduced automatically when the operating system requests reduced motion',
                ]}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gov-slate">Data-heavy surfaces</h3>
            <div className="mt-3">
              <PublicList
                items={[
                  'Empty, loading and error states are announced rather than appearing silently',
                  'Tables expose header relationships for screen reader navigation',
                  'Dialogs are focusable, dismissible and labelled',
                  'Icons that carry meaning have accessible names or are hidden from assistive technology',
                ]}
              />
            </div>
          </div>
        </div>
      </PublicSection>

      <PublicSection eyebrow="Known limitations" title="Where the interface still falls short" tone="white">
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
          <PublicList
            items={[
              'The map workspace depends on an interactive canvas and third-party controls, which are not fully operable by screen reader today',
              'Charts communicate shape and trend visually; underlying values are available in the accompanying tables but are not linked programmatically to each chart',
              'Some third-party components (map tiles, external fonts) ship their own accessibility characteristics',
              'No formal assistive-technology testing has been carried out yet',
            ]}
          />
        </div>
      </PublicSection>

      <PublicSection eyebrow="Feedback" title="Tell us where this page is wrong" tone="white">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <p className="text-sm leading-relaxed text-slate-600">
            If a part of BhoomiDarpan prevented you from completing a task, report it to your
            deployment's administrator, describing the page, what you were trying to do and what
            happened.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-gov-canvas p-4">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Contact
              </dt>
              <dd className="mt-1 text-sm text-gov-slate">
                <Link to={contactPath} className="text-gov-navy hover:underline">
                  {PUBLIC_CONFIG.contact.email ?? 'Contact page'}
                </Link>
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-gov-canvas p-4">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Configured contact address
              </dt>
              <dd className="mt-1 text-sm text-gov-slate">
                {PUBLIC_CONFIG.contact.email ?? NOT_CONFIGURED_TEXT}
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            Reports are logged with your account context so they can be reproduced and prioritised.
          </p>
        </div>
      </PublicSection>

      <CtaBand
        title="Continue to the platform"
        description="The account pages and the application follow the same focus, labelling and responsive conventions described above."
        primaryLabel="Sign In"
        primaryTo={loginPath}
        secondaryLabel="Contact"
        secondaryTo={contactPath}
      />
    </PublicPageLayout>
  );
};

export default AccessibilityPage;
