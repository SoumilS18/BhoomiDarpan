import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Compass,
  Crosshair,
  Eye,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Layers,
  LineChart,
  Lock,
  Map,
  Network,
  Route,
  Scale,
  Search,
  ShieldCheck,
  Timer,
  Waypoints,
} from 'lucide-react';
import {
  LandingHero,
  PublicCard,
  PublicGrid,
  PublicSection,
  CtaBand,
  DecisionSupportNotice,
  IconPlate,
  PublicList,
  NoticeBox,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { LandingShowcase } from '../../components/layout/public/LandingShowcase';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';

const CAPABILITIES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <FolderKanban className="h-5 w-5" />,
    title: 'Case management',
    body: 'A single statutory record per acquisition case — status, priority, jurisdiction, parcels, compensation and every event raised against it.',
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Configurable workflows',
    body: 'Stages, durations, required roles, required documents and completion criteria are held as configuration, so a case advances only when the engine says it may.',
  },
  {
    icon: <Map className="h-5 w-5" />,
    title: 'GIS & spatial cadastre',
    body: 'Case boundaries, parcels, project corridors, administrative geography and sovereign thematic overlays in one map workspace.',
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Document intelligence',
    body: 'Statutory documents are classified, processed, and their extracted fields checked against the case — with every extraction available for officer verification.',
  },
  {
    icon: <Gauge className="h-5 w-5" />,
    title: 'Risk assessment',
    body: 'Deterministic scoring from evidence already on the case: unresolved disputes, blocked stages, document gaps, mapping state and schedule deviation.',
  },
  {
    icon: <Timer className="h-5 w-5" />,
    title: 'Delay prediction',
    body: 'Projected completion derived from observed stage velocity along the dependency graph, with a stated methodology and confidence basis.',
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: 'Bottleneck & root cause',
    body: 'Cross-case detection of where work is pooling, classification of the likely cause, and the evidence behind each classification.',
  },
  {
    icon: <Waypoints className="h-5 w-5" />,
    title: 'Downstream impact',
    body: 'What a stalled stage threatens next — dependent stages, dependent cases and the project milestones that inherit the slip.',
  },
  {
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: 'Recommendations',
    body: 'Evidence-based suggested actions with an explicit lifecycle: proposed, accepted, rejected, implemented, completed — plus observed outcome.',
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: 'Operational notifications',
    body: 'Overdue stages, critical risk, blocked dependencies, stale external data and escalation — routed by severity and event type.',
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Portfolio analytics',
    body: 'Overview, delay, risk, bottleneck, trend, geography and outcome views — each filterable by project, state, district, workflow, status and risk.',
  },
  {
    icon: <BookOpen className="h-5 w-5" />,
    title: 'Audit trail',
    body: 'Material actions are recorded with actor, role, timestamp and detail, so a decision can be reconstructed after the fact.',
  },
];

const HOW_STEPS: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <ClipboardList className="h-5 w-5" />, title: 'Case', body: 'An acquisition case is opened against a project, workflow and official LGD administrative geography.' },
  { icon: <GitBranch className="h-5 w-5" />, title: 'Workflow', body: 'Stages are instantiated from configuration with durations, dependencies, required roles and required evidence.' },
  { icon: <FileText className="h-5 w-5" />, title: 'Evidence', body: 'Documents, survey and mapping records, disputes and approvals accumulate against each stage.' },
  { icon: <Scale className="h-5 w-5" />, title: 'Expected vs actual', body: 'Planned dates and durations are compared with what actually happened on the case.' },
  { icon: <AlertTriangle className="h-5 w-5" />, title: 'Deviation', body: 'The gap between plan and reality is quantified per stage and propagated across dependencies.' },
  { icon: <Gauge className="h-5 w-5" />, title: 'Risk', body: 'Deviation combines with disputes, document gaps and mapping state into an explainable risk score.' },
  { icon: <Search className="h-5 w-5" />, title: 'Cause', body: 'Root-cause analysis classifies the driver and cites the specific evidence it used.' },
  { icon: <Waypoints className="h-5 w-5" />, title: 'Impact', body: 'Downstream analysis shows which stages, cases and milestones inherit the delay.' },
  { icon: <CheckCircle2 className="h-5 w-5" />, title: 'Recommendation', body: 'A concrete, reviewable action is proposed with its supporting evidence attached.' },
  { icon: <Eye className="h-5 w-5" />, title: 'Officer action', body: 'An authorised officer accepts, rejects or implements it — the engine never acts on its own.' },
  { icon: <LineChart className="h-5 w-5" />, title: 'Observed outcome', body: 'What actually changed afterwards is recorded as measured, officer-reported, or insufficient evidence.' },
  { icon: <BarChart3 className="h-5 w-5" />, title: 'Portfolio intelligence', body: 'Outcomes feed the portfolio view, so system-level patterns become visible to decision-makers.' },
];

export const LandingPage: React.FC = () => {
  const loginPath = getRouteById('auth.login').path;
  const featuresPath = getRouteById('public.features').path;
  const howPath = getRouteById('public.howItWorks').path;
  const securityPath = getRouteById('public.security').path;

  return (
    <PublicPageLayout metaKey="landing">
      <LandingHero
        primaryAction={
          <Link
            to={loginPath}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 px-6 py-3.5 text-sm font-bold text-gov-navy shadow-lg transition-all hover:scale-105 hover:shadow-amber-500/20"
          >
            Sign In (Demo Roles)
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
        secondaryAction={
          <Link
            to={featuresPath}
            className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/20 hover:border-white/40"
          >
            Explore Capabilities
          </Link>
        }
        showcase={<LandingShowcase />}
      />

      {/* 2 — What BhoomiDarpan does */}
      <PublicSection
        eyebrow="What it does"
        title="One operational record for every acquisition case"
        lead="Land acquisition work is normally spread across registers, spreadsheets, file movements and disconnected maps. BhoomiDarpan keeps the case, its workflow, its documents, its geography and its evidence in one place — and keeps the reasoning auditable."
        tone="white"
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <PublicCard
            icon={<IconPlate tone="navy"><LayoutDashboard className="h-5 w-5" /></IconPlate>}
            title="Monitor"
            description="See the true state of every case, stage and project — what is on time, what is blocked, and what is waiting on whom."
          />
          <PublicCard
            icon={<IconPlate tone="amber"><Brain className="h-5 w-5" /></IconPlate>}
            title="Predict"
            description="Estimate delay and risk from observed stage velocity and evidence on the record, with the methodology stated alongside the number."
          />
          <PublicCard
            icon={<IconPlate tone="emerald"><Crosshair className="h-5 w-5" /></IconPlate>}
            title="Decide and act"
            description="Present a reviewable recommendation to the authorised officer, record the action taken, and measure what actually changed."
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
              <Compass className="h-4 w-4 text-gov-navy" aria-hidden="true" />
              Built around the statute
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Workflow stages, required documents and completion criteria are configuration — not
              code — so the platform follows the framework your workflow is defined under rather
              than a fixed opinion.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
              <Layers className="h-4 w-4 text-gov-navy" aria-hidden="true" />
              Grounded in official geography
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              State, district, sub-district and village selection uses the official Local Government
              Directory hierarchy and its LGD codes — the same identifiers used elsewhere in the
              record.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
              <Lock className="h-4 w-4 text-gov-navy" aria-hidden="true" />
              Access is enforced, not assumed
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Roles are resolved server-side on every request. Row-level security restricts data at
              the database, and privileged provider credentials never leave the server.
            </p>
          </div>
        </div>
      </PublicSection>

      {/* 3 — Core capabilities */}
      <PublicSection
        eyebrow="Core capabilities"
        title="What the platform actually does"
        lead="Each capability below corresponds to a working module of the application — not a roadmap item."
      >
        <PublicGrid cols={4}>
          {CAPABILITIES.map((item) => (
            <PublicCard key={item.title} icon={<IconPlate tone="blue">{item.icon}</IconPlate>} title={item.title}>
              {item.body}
            </PublicCard>
          ))}
        </PublicGrid>
      </PublicSection>

      {/* 4 — How the system works */}
      <PublicSection
        id="how-it-works"
        eyebrow="How the system works"
        title="The evidence loop"
        lead="BhoomiDarpan maintains one continuous chain from the case itself to portfolio-level intelligence."
        tone="white"
      >
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-gov"
            >
              <div className="flex items-center justify-between">
                <IconPlate tone="slate">{step.icon}</IconPlate>
                <span className="text-2xl font-bold text-slate-200">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gov-slate">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Link
            to={howPath}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
          >
            Read the full walkthrough
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>

      {/* 5 — Workflow intelligence */}
      <PublicSection
        eyebrow="Workflow intelligence"
        title="Configuration-driven stages, enforced by the engine"
        lead="Stage order, durations, dependencies, required roles, required documents and completion criteria live in configuration. The engine evaluates the checklist before any transition is accepted — including stay orders, unresolved disputes and geometry validity."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
            <h3 className="text-sm font-semibold text-gov-slate">Before a stage advances</h3>
            <div className="mt-3">
              <PublicList
                items={[
                  'Predecessor stages are complete',
                  'The acting role is authorised for the transition',
                  'Required statutory documents are present and verified',
                  'Required supervisory approval exists',
                  'No active judicial stay or injunction blocks progress',
                  'No unresolved dispute remains open',
                  'Parcel geometry is verified where mapping is required',
                ]}
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
            <h3 className="text-sm font-semibold text-gov-slate">When it will not advance</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The API refuses the transition and returns the specific unmet requirements. The
              officer sees exactly what is missing rather than a generic failure — and the refusal
              is recorded.
            </p>
            <div className="mt-4">
              <NoticeBox tone="info">
                Frontend visibility is presentation only. Authorisation and transition rules are
                always evaluated on the server.
              </NoticeBox>
            </div>
          </div>
        </div>
      </PublicSection>

      {/* 6 — GIS */}
      <PublicSection
        eyebrow="GIS & spatial intelligence"
        title="Geography that is actually queried, not decorated"
        tone="dark"
        lead="Administrative filters change the underlying query. Layers report zero records honestly instead of inventing markers."
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Map className="h-5 w-5" />, title: 'Project geography', body: 'Corridors and project scope alongside the cases they contain.' },
            { icon: <Crosshair className="h-5 w-5" />, title: 'Acquisition parcels', body: 'Per-parcel geometry and acquisition status, from identified through disbursed.' },
            { icon: <Route className="h-5 w-5" />, title: 'Proximity & routing', body: 'Nearby entities, distance and road routing for site context.' },
            { icon: <Layers className="h-5 w-5" />, title: 'Thematic overlays', body: 'Sovereign and open thematic layers presented as visual context, not as measurements.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
                {item.icon}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link
            to={getRouteById('public.gisIntelligence').path}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:underline"
          >
            More about GIS intelligence
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>

      {/* 7 — Predictive intelligence */}
      <PublicSection
        eyebrow="Predictive intelligence"
        title="Risk, delay and bottlenecks — with the reasoning attached"
        tone="white"
        lead="Every score, projection and classification is produced from evidence on the case and is accompanied by the factors that produced it."
      >
        <PublicGrid cols={3}>
          <PublicCard
            icon={<IconPlate tone="amber"><Gauge className="h-5 w-5" /></IconPlate>}
            title="Risk score"
            description="A deterministic composition of disputes, blocked stages, document gaps, mapping state and schedule deviation — each factor listed with its contribution."
          />
          <PublicCard
            icon={<IconPlate tone="blue"><Timer className="h-5 w-5" /></IconPlate>}
            title="Delay projection"
            description="Observed stage velocity and the dependency graph project a completion window, labelled with its methodology and evidence sufficiency."
          />
          <PublicCard
            icon={<IconPlate tone="slate"><Network className="h-5 w-5" /></IconPlate>}
            title="Bottleneck & root cause"
            description="Where work is pooling across the portfolio, why it is pooling, and how confident the platform is in that explanation."
          />
        </PublicGrid>

        <div className="mt-6">
          <DecisionSupportNotice />
        </div>

        <div className="mt-5">
          <Link
            to={getRouteById('public.decisionSupport').path}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
          >
            How decision-support outputs should be used
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>

      {/* 8 — Documents & workflow */}
      <PublicSection
        eyebrow="Documents & workflow"
        title="The statutory file, tracked stage by stage"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <PublicCard title="Required documents come from configuration">
            The document checklist shown to an officer is derived from the stage's configured
            requirements — not from a list typed into a component.
          </PublicCard>
          <PublicCard title="Extraction is a proposal, not a verdict">
            Machine-extracted fields are presented for verification. An officer accepts, edits or
            rejects them, and that decision is recorded against the document.
          </PublicCard>
          <PublicCard title="Verification gates advancement">
            A stage that requires verified documents cannot be completed while documents sit in
            <span className="font-medium text-gov-slate"> pending verification</span> or
            <span className="font-medium text-gov-slate"> rejected</span> states.
          </PublicCard>
        </div>
      </PublicSection>

      {/* 9 — Notifications */}
      <PublicSection
        eyebrow="Operational notifications"
        title="Only what needs attention, ranked by severity"
        tone="white"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <PublicList
              items={[
                'Overdue stages and workflow escalation',
                'Critical risk and predicted delay',
                'Blocked dependencies and active bottlenecks',
                'Documents awaiting verification',
                'Cadastral disputes and unresolved recommendations',
                'Stale or unavailable external data',
              ]}
            />
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Notifications carry a severity (<span className="font-medium text-gov-slate">info</span>,{' '}
              <span className="font-medium text-gov-slate">warning</span>,{' '}
              <span className="font-medium text-gov-slate">critical</span>,{' '}
              <span className="font-medium text-gov-slate">urgent</span>) and a lifecycle of
              acknowledge, resolve, dismiss and escalate. Counts are read from the database; an empty
              system reports zero.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gov-slate">
              <Bell className="h-4 w-4 text-gov-navy" aria-hidden="true" />
              Honest counts
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Unread totals, severity breakdowns and per-event counts are all server-computed. The
              interface never pads a counter and never invents an example notification to fill a
              panel.
            </p>
          </div>
        </div>
      </PublicSection>

      {/* 10 — Analytics */}
      <PublicSection
        eyebrow="Portfolio analytics"
        title="National and regional views that respond to real filters"
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Overview', body: 'Portfolio composition, evidence sufficiency and operational health.' },
            { title: 'Delays', body: 'Delay distribution and the cases contributing to each bucket.' },
            { title: 'Risk', body: 'Risk distribution and trend direction across the portfolio.' },
            { title: 'Bottlenecks', body: 'Where cases are pooling, ranked by severity and reach.' },
            { title: 'Geography', body: 'State and district drill-down with mapping state per node.' },
            { title: 'Outcomes', body: 'Simulated → proposed → accepted → implemented → observed.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
              <h3 className="text-sm font-semibold text-gov-slate">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-slate-600">
          Filters are backed by the analytics API's own dimension lists — projects, states,
          districts and workflows the data actually contains. Where history is too thin to support a
          trend, the view reports{' '}
          <span className="font-medium text-gov-slate">insufficient history</span> rather than
          drawing a line through nothing.
        </p>
      </PublicSection>

      {/* 11 — Security */}
      <PublicSection
        eyebrow="Security & governance"
        title="Credentials stay on the server"
        tone="white"
      >
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <ShieldCheck className="h-5 w-5" />, title: 'Server-side credentials', body: 'Provider keys, database credentials and service-role keys are read by the server only and never bundled for the browser.' },
            { icon: <Lock className="h-5 w-5" />, title: 'Role-based access', body: 'Every privileged API validates identity and role before acting; navigation visibility is never the control.' },
            { icon: <Lock className="h-5 w-5" />, title: 'Enforced in two places', body: 'The API validates identity and role on every request, and row-level security is enabled on the core database tables beneath it.' },
            { icon: <Eye className="h-5 w-5" />, title: 'Audit trail', body: 'Material actions carry actor, role, timestamp and detail for later reconstruction.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-gov-canvas p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gov-navy text-white">
                {item.icon}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gov-slate">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link
            to={securityPath}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
          >
            Read the security overview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>

      {/* 12 — Call to action */}
      <CtaBand
        title="Ready to see the application?"
        description="Sign in with an account issued for your department. If you do not have one yet, the access request page explains exactly what an administrator needs."
        primaryLabel="Sign In"
        primaryTo={loginPath}
        secondaryLabel="Request access"
        secondaryTo={getRouteById('auth.requestAccess').path}
      />
    </PublicPageLayout>
  );
};

export default LandingPage;
