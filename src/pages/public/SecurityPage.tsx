import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  Eye,
  FileCheck2,
  KeyRound,
  Lock,
  Scale,
  Server,
  ShieldCheck,
  Timer,
} from 'lucide-react';
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

const CONTROLS: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <KeyRound className="h-5 w-5" />,
    title: 'Authentication',
    body: 'Accounts sign in through a Supabase Auth project with email and password. The resulting session token is presented to the API as a bearer token and verified server-side on each request; expired or invalid tokens are refused.',
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Role-based authorisation',
    body: 'Every privileged API route requires an authenticated identity and, where applicable, one of a defined set of roles. A caller cannot grant itself a role through a query parameter or request body.',
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: 'Row-level security',
    body: 'Row-level security is enabled on the core tables. Note that the policy set shipped with the current schema is permissive, so the API authorisation layer is the primary enforcement point today; restricting those policies to role-scoped rules is a documented deployment hardening step.',
  },
  {
    icon: <Server className="h-5 w-5" />,
    title: 'Server-side credentials',
    body: 'Provider and database credentials are read by the server process only. The browser bundle receives no service-role key, no database connection string and no external provider secret.',
  },
  {
    icon: <Eye className="h-5 w-5" />,
    title: 'Audit trail',
    body: 'Material actions record the actor, their role, a timestamp and detail, so a later review can reconstruct what happened and who did it.',
  },
  {
    icon: <FileCheck2 className="h-5 w-5" />,
    title: 'Input validation',
    body: 'Request bodies are validated server-side against typed schemas, uploaded filenames are sanitised, and imported geometry is validated before it is accepted.',
  },
];

const SERVER_SIDE_SECRETS = [
  'Database connection string and service-role key',
  'Local Government Directory / data.gov.in API key',
  'Document and document-extraction provider credentials',
  'Satellite and earth-observation credentials, where configured',
  'Statutory translation provider credentials, where configured',
  'Routing, geocoding and map-provider credentials used by the server',
];

export const SecurityPage: React.FC = () => (
  <PublicPageLayout metaKey="security">
    <PageHero
      metaKey="security"
      lead="This page describes the access control, credential handling and audit mechanisms that are actually implemented in BhoomiSetu. It makes no certification or compliance claim."
    />

    <PublicSection eyebrow="Controls" title="What is in place" tone="white">
      <PublicGrid cols={3}>
        {CONTROLS.map((item) => (
          <PublicCard key={item.title} icon={<IconPlate tone="navy">{item.icon}</IconPlate>} title={item.title}>
            {item.body}
          </PublicCard>
        ))}
      </PublicGrid>
    </PublicSection>

    <PublicSection
      eyebrow="Credentials"
      title="What never reaches the browser"
      lead="Secrets stay server-side by construction: the browser can only call BhoomiSetu's own API, and the server holds the credentials for everything behind it."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <Lock className="h-4 w-4 text-gov-navy" aria-hidden="true" />
            Server-side only
          </h3>
          <div className="mt-3">
            <PublicList items={SERVER_SIDE_SECRETS} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <CheckCircle2 className="h-4 w-4 text-gov-emerald" aria-hidden="true" />
            Available to the browser
          </h3>
          <div className="mt-3">
            <PublicList
              items={[
                'The Supabase project URL and anon (public) key, which are designed for client use and are constrained by RLS and policies',
                'A public map-provider key intended for browser use and restricted by the provider to the application origin',
                'Nothing else — there is no VITE_-prefixed service credential in the client bundle',
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <NoticeBox tone="info" title="External services are reached indirectly">
          Administrative geography, document processing, translation, satellite metadata and other
          provider calls are made by the server. The browser never holds a provider key and never
          talks to a provider directly on the user's behalf.
        </NoticeBox>
      </div>
    </PublicSection>

    <PublicSection eyebrow="Access model" title="How an identity becomes a permission" tone="white">
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { step: 'Sign in', body: 'The officer authenticates with the configured authentication provider.' },
          { step: 'Token verified', body: 'The API verifies the presented token and resolves the user profile and role from the database.' },
          { step: 'Role checked', body: 'The specific route checks whether that role is permitted to perform this operation.' },
          { step: 'Action recorded', body: 'The action is written to the audit trail with actor, role, timestamp and detail.' },
        ].map((item, index) => (
          <li key={item.step} className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gov-navy text-xs font-bold text-white">
              {index + 1}
            </span>
            <h3 className="mt-3 text-sm font-semibold text-gov-slate">{item.step}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <h3 className="text-sm font-semibold text-gov-slate">Navigation is not the control</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Hiding a menu item is a usability decision, not a security one. A user who types a URL
            for a surface outside their role is still refused by the API when the page requests its
            data.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <h3 className="text-sm font-semibold text-gov-slate">Non-production role context</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            For development and evaluation, the server accepts a role context that is rejected
            outright when the server runs in production mode. It is a development affordance, not an
            authentication mechanism, and it is never a way to gain access to a production deployment.
          </p>
        </div>
      </div>
    </PublicSection>

    <PublicSection eyebrow="Data handling" title="Provenance, freshness and external data">
      <PublicGrid cols={3}>
        <PublicCard
          icon={<IconPlate tone="blue"><BookOpen className="h-5 w-5" /></IconPlate>}
          title="Provenance"
          description="Records carry the source of each material value — entered by an officer, derived by the system, calculated, externally sourced or AI-assisted."
        />
        <PublicCard
          icon={<IconPlate tone="amber"><Timer className="h-5 w-5" /></IconPlate>}
          title="Freshness"
          description="Externally sourced observations carry freshness metadata, so stale data is surfaced at the point of use rather than presented as current."
        />
        <PublicCard
          icon={<IconPlate tone="slate"><Scale className="h-5 w-5" /></IconPlate>}
          title="Retention & access review"
          description="Records are retained as part of the case file they belong to. Access is bounded by the role issued to each account, and roles are administered by the deployment's administrator."
        />
      </PublicGrid>

      <div className="mt-6">
        <NoticeBox tone="warning" title="What this page does not claim">
          BhoomiSetu does not claim any external security certification, audit attestation, government
          approval or statutory compliance status. This page is a description of implemented
          technical controls only, not an assurance report.
        </NoticeBox>
      </div>
    </PublicSection>

    <PublicSection eyebrow="Reporting" title="Security contact" tone="white">
      <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
        <p className="text-sm leading-relaxed text-slate-600">
          To report a suspected vulnerability or a misconfigured account, contact the administrator
          of your deployment.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Contact address
            </dt>
            <dd className="mt-1 text-sm text-gov-slate">
              {PUBLIC_CONFIG.contact.email ?? NOT_CONFIGURED_TEXT}
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Point of contact
            </dt>
            <dd className="mt-1 text-sm text-gov-slate">
              {PUBLIC_CONFIG.contact.pointOfContact ?? NOT_CONFIGURED_TEXT}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          These values are deployment configuration. They are not populated with placeholder names or
          addresses.
        </p>
      </div>
    </PublicSection>

    <CtaBand
      title="Questions about access?"
      description="Sign in if you already have an account, or read the privacy policy to understand how information is handled."
      primaryLabel="Sign In"
      primaryTo={getRouteById('auth.login').path}
      secondaryLabel="Privacy Policy"
      secondaryTo={getRouteById('public.privacy').path}
    />
  </PublicPageLayout>
);

export default SecurityPage;
