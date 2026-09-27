import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Gauge,
  Network,
  Scale,
  Search,
  Timer,
} from 'lucide-react';
import {
  PageHero,
  PublicSection,
  PublicGrid,
  PublicCard,
  CtaBand,
  IconPlate,
  DecisionSupportNotice,
  PublicList,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';

const OUTPUTS: { icon: React.ReactNode; title: string; produced: string; limit: string }[] = [
  {
    icon: <Gauge className="h-5 w-5" />,
    title: 'Risk score',
    produced: 'A deterministic composition of factors present on the case, with each factor and its weight shown.',
    limit:
      'A score reflects the evidence currently on the record. Incomplete or unverified records produce a score built on incomplete evidence.',
  },
  {
    icon: <Timer className="h-5 w-5" />,
    title: 'Delay projection',
    produced: 'A projected completion window derived from observed stage velocity along the dependency graph.',
    limit:
      'It is an estimate. It assumes the observed pace continues and does not account for events that have not happened yet.',
  },
  {
    icon: <Search className="h-5 w-5" />,
    title: 'Root cause',
    produced: 'A classification of the most likely driver, with the specific evidence cited and a confidence statement.',
    limit:
      'Classification is an interpretation of the record. Where evidence is thin, the platform reports that rather than committing to a cause.',
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: 'Bottleneck & impact',
    produced: 'Where work is pooling across cases, and what a stall threatens downstream.',
    limit:
      'Impact follows recorded dependencies. Dependencies not captured in the record cannot be traced.',
  },
  {
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: 'Recommendation',
    produced: 'A concrete, reviewable action with supporting evidence, entering a proposed state.',
    limit:
      'It is a proposal. It is never executed automatically and it is always subject to an authorised officer deciding otherwise.',
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: 'AI-assisted interpretation',
    produced: 'Textual interpretation of documents and case context where an AI provider is configured.',
    limit:
      'Machine-extracted content is marked for verification. If no provider is configured, the platform reports that rather than substituting generic text.',
  },
];

const ROLES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <Scale className="h-5 w-5" />,
    title: 'Statutory & legal decisions',
    body: 'Award, settlement, acquisition and litigation decisions remain with the officer or authority empowered to make them.',
  },
  {
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: 'Workflow advancement',
    body: 'Advancing a stage requires an authorised role. The platform may refuse an invalid transition; it never advances a stage on an officer\'s behalf.',
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: 'Recommendation disposition',
    body: 'Accepting, rejecting or implementing a recommendation is recorded as an officer action with a named actor.',
  },
];

export const DecisionSupportPage: React.FC = () => (
  <PublicPageLayout metaKey="decisionSupport">
    <PageHero
      metaKey="decisionSupport"
      lead="BhoomiSetu produces estimates, classifications and proposals. It does not make decisions. This page describes exactly what each output is, what it rests on, and where it stops."
    />

    <PublicSection eyebrow="Standing notice" title="What this platform is for" tone="white">
      <DecisionSupportNotice />
    </PublicSection>

    <PublicSection eyebrow="Outputs" title="Each output, its basis, and its limits">
      <div className="space-y-4">
        {OUTPUTS.map((item) => (
          <div
            key={item.title}
            className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-gov lg:grid-cols-[minmax(0,240px)_1fr_1fr]"
          >
            <div className="flex items-start gap-3">
              <IconPlate tone="navy">{item.icon}</IconPlate>
              <h3 className="pt-1.5 text-sm font-semibold text-gov-slate">{item.title}</h3>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                What it is
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.produced}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                Where it stops
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.limit}</p>
            </div>
          </div>
        ))}
      </div>
    </PublicSection>

    <PublicSection eyebrow="Boundaries" title="Decisions that remain with authorised people" tone="white">
      <PublicGrid cols={3}>
        {ROLES.map((item) => (
          <PublicCard key={item.title} icon={<IconPlate tone="amber">{item.icon}</IconPlate>} title={item.title}>
            {item.body}
          </PublicCard>
        ))}
      </PublicGrid>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
          <h3 className="text-base font-semibold text-gov-slate">Data quality affects every output</h3>
          <div className="mt-3">
            <PublicList
              items={[
                'A score is only as complete as the record it reads',
                'External observations carry freshness metadata and may be stale or unavailable',
                'Machine-extracted fields may require officer correction before they are relied on',
                'Thin history is reported as insufficient rather than smoothed into a trend',
              ]}
            />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
          <h3 className="text-base font-semibold text-gov-slate">When a provider is unavailable</h3>
          <div className="mt-3">
            <PublicList
              items={[
                'The interface reports the provider status rather than substituting sample content',
                'Missing analysis is shown as unavailable, not as a generic explanation',
                'Provenance and freshness remain visible so a reader can judge the input',
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-gov-saffron">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gov-slate">
              Predictions should not be presented as outcomes
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              A projected completion date is not a commitment, a risk band is not a finding of fact,
              and a recommendation is not a directive. Where these outputs are quoted onward — in
              reports, briefings or correspondence — their estimated nature should travel with them.
            </p>
          </div>
        </div>
      </div>
    </PublicSection>

    <CtaBand
      title="See it against a live record"
      description="Open a case workspace to view the risk assessment, delay projection, root-cause panel and recommendation list with the evidence each one used."
      primaryLabel="Sign In"
      primaryTo={getRouteById('auth.login').path}
      secondaryLabel="Security"
      secondaryTo={getRouteById('public.security').path}
    />
  </PublicPageLayout>
);

export default DecisionSupportPage;
