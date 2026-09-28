import React from 'react';
import {
  ArrowRight,
  AlertTriangle,
  ClipboardList,
  Eye,
  GitBranch,
  Layers,
  Map,
  Scale,
} from 'lucide-react';
import {
  PageHero,
  PublicSection,
  PublicCard,
  PublicGrid,
  CtaBand,
  IconPlate,
  PublicList,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';

const PROBLEM_POINTS: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: 'Fragmented monitoring',
    body: 'Case state lives in registers, spreadsheets, file movements and personal notes. Nobody can answer "where does this stand today" without calling someone.',
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Invisible workflow position',
    body: 'A case is either "with the office" or "not with the office". Which stage it sits in, what it is waiting on, and who owes the next action is rarely visible.',
  },
  {
    icon: <Map className="h-5 w-5" />,
    title: 'Geography held separately',
    body: 'Boundaries and parcels sit in map files while the case narrative sits elsewhere, so spatial questions require a separate exercise each time.',
  },
  {
    icon: <AlertTriangle className="h-5 w-5" />,
    title: 'Late discovery of delay',
    body: 'Slip is usually recognised after the deadline has already passed, when the only options left are reactive ones.',
  },
  {
    icon: <Eye className="h-5 w-5" />,
    title: 'Unverifiable reasoning',
    body: 'When a decision is questioned months later, the evidence and the reasoning that supported it are difficult to reconstruct.',
  },
  {
    icon: <Scale className="h-5 w-5" />,
    title: 'Disconnected disputes and documents',
    body: 'Objections, stay orders and statutory documents are tracked apart from the case timeline, so their effect on the schedule is easy to miss.',
  },
];

export const AboutPage: React.FC = () => (
  <PublicPageLayout metaKey="about">
    <PageHero
      metaKey="about"
      lead="BhoomiDarpan is decision-support software for land acquisition casework. It exists to make the state of every case, the reason for that state, and the evidence behind it visible to the people responsible for moving it forward."
    />

    <PublicSection eyebrow="The problem" title="Acquisition work is hard to see as a whole" tone="white">
      <PublicGrid cols={3}>
        {PROBLEM_POINTS.map((item) => (
          <PublicCard key={item.title} icon={<IconPlate tone="slate">{item.icon}</IconPlate>} title={item.title}>
            {item.body}
          </PublicCard>
        ))}
      </PublicGrid>
    </PublicSection>

    <PublicSection
      eyebrow="What BhoomiDarpan is"
      title="A single operational record with its reasoning attached"
      lead="BhoomiDarpan keeps the case, its workflow position, its documents, its disputes, its geography and its evidence together — and then applies consistent analysis across that record."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gov-slate">
            <Layers className="h-5 w-5 text-gov-navy" aria-hidden="true" />
            What it brings together
          </h3>
          <div className="mt-4">
            <PublicList
              items={[
                'Case records with status, priority, jurisdiction and parcel detail',
                'Configurable statutory workflow with stages, dependencies and required evidence',
                'Document processing with officer verification of extracted fields',
                'Disputes and objections, including hearing status and stay orders',
                'GIS context: case boundaries, parcels, corridors and administrative geography',
                'External context such as weather and geocoding, with its freshness recorded',
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gov-slate">
            <Eye className="h-5 w-5 text-gov-navy" aria-hidden="true" />
            What it makes visible
          </h3>
          <div className="mt-4">
            <PublicList
              items={[
                'Where a case actually sits in its workflow, and what it is waiting on',
                'How planned duration compares with what has really happened',
                'Which risks are present, and the specific evidence producing each one',
                'Where work is pooling across the portfolio, and why',
                'What a stall threatens downstream, across stages, cases and milestones',
                'What was recommended, what an officer did about it, and what changed afterwards',
              ]}
            />
          </div>
        </div>
      </div>
    </PublicSection>

    <PublicSection
      eyebrow="Design position"
      title="Three commitments the platform is built around"
      tone="white"
    >
      <PublicGrid cols={3}>
        <PublicCard
          icon={<IconPlate tone="navy"><Scale className="h-5 w-5" /></IconPlate>}
          title="Evidence before assertion"
        >
          Analysis is only useful if it can be checked. Risk factors, root causes and delay
          projections are presented with the evidence they were derived from, and the interface
          distinguishes observed fact from predictive estimate.
        </PublicCard>
        <PublicCard
          icon={<IconPlate tone="amber"><GitBranch className="h-5 w-5" /></IconPlate>}
          title="Configuration before code"
        >
          Workflow stages, required documents, completion criteria and operational thresholds are
          configuration. When policy changes, the record follows the configuration rather than a
          hardcoded list in an interface.
        </PublicCard>
        <PublicCard
          icon={<IconPlate tone="emerald"><Eye className="h-5 w-5" /></IconPlate>}
          title="Honesty about what is not known"
        >
          Where data is missing, stale or insufficient for a conclusion, the platform says so.
          Empty results are shown as empty, unavailable providers are shown as unavailable, and
          thin history is reported as insufficient rather than smoothed over.
        </PublicCard>
      </PublicGrid>
    </PublicSection>

    <PublicSection eyebrow="Transparency" title="Auditability is a feature, not an export">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <h3 className="text-sm font-semibold text-gov-slate">Every material action is recorded</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Stage transitions, document verification, dispute updates and recommendation decisions
            carry an actor, a role, a timestamp and detail — so the history of a case can be
            reconstructed rather than remembered.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <h3 className="text-sm font-semibold text-gov-slate">Sources are declared</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Data carries provenance and freshness metadata. Externally sourced values are marked as
            such, and stale inputs are surfaced instead of being presented as current.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <h3 className="text-sm font-semibold text-gov-slate">Access is bounded</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Roles are resolved server-side on each request before any action is taken, and
            privileged routes additionally check the role required for that specific operation.
            Visibility in navigation is a convenience, never the security control.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Link
          to={getRouteById('public.security').path}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
        >
          Security and governance details
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PublicSection>

    <CtaBand
      title="See how it works on the record"
      description={PUBLIC_CONFIG.decisionSupportNotice}
      primaryLabel="How It Works"
      primaryTo={getRouteById('public.howItWorks').path}
      secondaryLabel="Sign In"
      secondaryTo={getRouteById('auth.login').path}
    />
  </PublicPageLayout>
);

export default AboutPage;
