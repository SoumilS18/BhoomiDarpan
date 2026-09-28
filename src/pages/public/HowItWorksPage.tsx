import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Gauge,
  GitBranch,
  LineChart,
  Network,
  Scale,
  Search,
  Waypoints,
} from 'lucide-react';
import {
  PageHero,
  PublicSection,
  CtaBand,
  IconPlate,
  DecisionSupportNotice,
  PublicGrid,
  PublicCard,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';

interface Step {
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Short label for the "what this produces" column. */
  output: string;
  /** Whether the step is machine-produced or officer-produced. */
  actor: 'system' | 'officer';
}

const STEPS: Step[] = [
  {
    title: 'Case',
    body: 'A case is opened against a project and a configured workflow. Its location is set through the official LGD hierarchy — state, district, sub-district and village — using their LGD codes.',
    icon: <ClipboardList className="h-5 w-5" />,
    output: 'A single statutory record',
    actor: 'system',
  },
  {
    title: 'Workflow',
    body: 'Stages are instantiated from configuration: order, durations, dependencies, required roles, required documents and completion criteria.',
    icon: <GitBranch className="h-5 w-5" />,
    output: 'A planned timeline',
    actor: 'system',
  },
  {
    title: 'Evidence',
    body: 'Documents, survey and mapping records, approvals, disputes and hearings accumulate against the stages they belong to.',
    icon: <FileText className="h-5 w-5" />,
    output: 'A verifiable file',
    actor: 'system',
  },
  {
    title: 'Expected vs actual',
    body: 'Planned dates and durations are compared with what actually happened, stage by stage.',
    icon: <LineChart className="h-5 w-5" />,
    output: 'Measured performance',
    actor: 'system',
  },
  {
    title: 'Deviation',
    body: 'The gap between plan and reality is quantified, then propagated along the dependency graph to the stages that inherit it.',
    icon: <AlertTriangle className="h-5 w-5" />,
    output: 'Schedule deviation',
    actor: 'system',
  },
  {
    title: 'Risk',
    body: 'Deviation combines with unresolved disputes, document gaps, blocked stages and mapping state into an explainable risk score.',
    icon: <Gauge className="h-5 w-5" />,
    output: 'Risk score + factors',
    actor: 'system',
  },
  {
    title: 'Cause',
    body: 'Root-cause analysis classifies what is actually driving the position — dependency, documentation, approval, dispute, survey or external factors — and cites the evidence used.',
    icon: <Search className="h-5 w-5" />,
    output: 'Classified cause',
    actor: 'system',
  },
  {
    title: 'Impact',
    body: 'Downstream analysis traces which stages, cases and project milestones inherit the delay if nothing changes.',
    icon: <Waypoints className="h-5 w-5" />,
    output: 'Impact graph',
    actor: 'system',
  },
  {
    title: 'Recommendation',
    body: 'A concrete action is proposed with its supporting evidence attached and a status of "proposed".',
    icon: <CheckCircle2 className="h-5 w-5" />,
    output: 'Reviewable proposal',
    actor: 'system',
  },
  {
    title: 'Officer action',
    body: 'An authorised officer accepts, rejects or implements it. The transition the server currently permits is the only set offered in the interface.',
    icon: <Eye className="h-5 w-5" />,
    output: 'Recorded decision',
    actor: 'officer',
  },
  {
    title: 'Observed outcome',
    body: 'What actually changed afterwards is recorded — measured, officer-reported, or explicitly marked as insufficient evidence.',
    icon: <Scale className="h-5 w-5" />,
    output: 'Outcome evidence',
    actor: 'officer',
  },
  {
    title: 'Portfolio intelligence',
    body: 'Outcomes aggregate into portfolio views, so patterns across cases and projects become visible to decision-makers.',
    icon: <BarChart3 className="h-5 w-5" />,
    output: 'System-level view',
    actor: 'system',
  },
];

export const HowItWorksPage: React.FC = () => (
  <PublicPageLayout metaKey="howItWorks">
    <PageHero
      metaKey="howItWorks"
      lead="BhoomiDarpan maintains one continuous chain from the case itself to portfolio-level intelligence. Each step below is a real stage of the platform's processing — not a conceptual diagram."
    />

    <PublicSection
      eyebrow="The chain"
      title="From case to portfolio intelligence"
      lead="System steps are produced by the platform. Officer steps require an authorised human decision — the platform never takes them on its behalf."
    >
      <ol className="relative space-y-4">
        {/* Spine */}
        <div
          className="absolute left-[19px] top-3 hidden h-full w-px bg-slate-200 sm:block"
          aria-hidden="true"
        />
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="flex gap-4">
              <div className="relative z-10 hidden shrink-0 sm:block">
                <IconPlate tone={step.actor === 'officer' ? 'amber' : 'navy'}>{step.icon}</IconPlate>
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-gov sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="sm:hidden">
                      <IconPlate tone={step.actor === 'officer' ? 'amber' : 'navy'}>{step.icon}</IconPlate>
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Step {String(index + 1).padStart(2, '0')} ·{' '}
                        {step.actor === 'officer' ? 'Officer decision' : 'Platform'}
                      </p>
                      <h2 className="text-base font-semibold text-gov-slate">{step.title}</h2>
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {step.output}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <ArrowRight
                className="mx-auto mt-2 hidden h-4 w-4 rotate-90 text-slate-300 sm:hidden"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </PublicSection>

    <PublicSection eyebrow="Enforcement" title="Where the platform stops" tone="white">
      <div className="grid gap-5 lg:grid-cols-2">
        <PublicCard
          icon={<IconPlate tone="navy"><GitBranch className="h-5 w-5" /></IconPlate>}
          title="The workflow engine decides what is permitted"
          description="Stage advancement is refused server-side unless every configured requirement is satisfied — predecessor stages, acting role, required documents, approvals, absence of an active judicial stay, absence of unresolved disputes, and valid geometry where mapping is required. The refusal names the specific unmet requirements."
        />
        <PublicCard
          icon={<IconPlate tone="amber"><Eye className="h-5 w-5" /></IconPlate>}
          title="An authorised officer decides what happens"
          description="Accepting a recommendation, rejecting it, verifying a document, recording a settlement — these are officer actions. The platform prepares the evidence and records the decision; it does not make the decision."
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <Network className="h-4 w-4 text-gov-navy" aria-hidden="true" />
            Evidence is classified
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Observed facts, calculated metrics, policy-derived risk, predictive estimates and
            AI-assisted interpretation are labelled distinctly, so a reader can tell which is which.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <Scale className="h-4 w-4 text-gov-navy" aria-hidden="true" />
            Outcomes are graded
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            An outcome can be measured, officer-reported, or explicitly insufficient evidence. The
            platform does not upgrade a weak signal into a confident one.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <CheckCircle2 className="h-4 w-4 text-gov-navy" aria-hidden="true" />
            Nothing is silently dropped
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Missing, stale or unavailable data is reported as such at the point of use, rather than
            being filled with an example or a default.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <DecisionSupportNotice />
      </div>
    </PublicSection>

    <CtaBand
      title="Walk the chain on a real case"
      description="Sign in to open a case workspace and follow the sequence through the workflow, evidence, intelligence and audit tabs."
      primaryLabel="Sign In"
      primaryTo={getRouteById('auth.login').path}
      secondaryLabel="Features"
      secondaryTo={getRouteById('public.features').path}
    />
  </PublicPageLayout>
);

export default HowItWorksPage;
