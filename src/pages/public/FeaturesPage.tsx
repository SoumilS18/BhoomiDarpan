import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  History,
  Layers,
  Map,
  Network,
  Scale,
  Search,
  Timer,
  Waypoints,
} from 'lucide-react';
import {
  PageHero,
  PublicSection,
  PublicCard,
  PublicGrid,
  CtaBand,
  IconPlate,
  DecisionSupportNotice,
} from '../../components/layout/public/PublicSections';
import { PublicPageLayout } from '../../components/layout/public/PublicPageLayout';
import { Link, getRouteById } from '../../router';

interface Feature {
  icon: React.ReactNode;
  title: string;
  body: string;
  detail: string[];
}

const FEATURE_GROUPS: { heading: string; intro: string; features: Feature[] }[] = [
  {
    heading: 'Core casework',
    intro: 'The operational record and the statutory process it follows.',
    features: [
      {
        icon: <FolderKanban className="h-5 w-5" />,
        title: 'Case management',
        body: 'Create, track and review acquisition cases end to end.',
        detail: [
          'Case registry with status, priority, jurisdiction and search',
          'Case workspace with overview, workflow, GIS, documents, disputes, intelligence, recommendations and audit tabs',
          'Parcel-level detail including acquisition status and compensation fields',
          'Project linkage so cases roll up into the corridor or scheme they belong to',
        ],
      },
      {
        icon: <GitBranch className="h-5 w-5" />,
        title: 'Workflow management',
        body: 'Configurable stages with enforced advancement rules.',
        detail: [
          'Stages, durations, dependencies, required roles and required documents held as configuration',
          'A pre-transition checklist covering dependencies, role authority, documents, approvals, stay orders, disputes and geometry',
          'Refusals return the specific unmet requirements instead of a generic failure',
          'Timeline view comparing planned against actual stage dates',
        ],
      },
      {
        icon: <Database className="h-5 w-5" />,
        title: 'Administrative geography',
        body: 'Official Local Government Directory hierarchy as the locational spine.',
        detail: [
          'State → district → sub-district → village selection with official LGD codes',
          'Cascading selectors that reset child options when the parent changes',
          'Server-side village lookup, so the national village set is never loaded into the browser',
          'Administrative enrichment applied to cases for consistent roll-ups',
        ],
      },
    ],
  },
  {
    heading: 'Evidence & documents',
    intro: 'What the case file actually contains, and how trustworthy it is.',
    features: [
      {
        icon: <FileText className="h-5 w-5" />,
        title: 'Document intelligence',
        body: 'Statutory documents classified, processed and verified by an officer.',
        detail: [
          'Document types come from the workflow stage configuration, not a fixed interface list',
          'Processing proposes extracted fields; an officer accepts, edits or rejects them',
          'Verification status gates stage advancement where the stage requires it',
          'Rejection reasons and validation notes are recorded against the document',
        ],
      },
      {
        icon: <Scale className="h-5 w-5" />,
        title: 'Disputes & objections',
        body: 'Objections, disputes, hearings and stay orders tracked as first-class records.',
        detail: [
          'Dispute type, statutory provision, filing date, priority and lifecycle status',
          'Hearing scheduling and decision recording',
          'Stay orders and injunctions tracked explicitly — never inferred from an ordinary dispute',
          'Unresolved disputes and active stays block stage advancement through the engine',
        ],
      },
      {
        icon: <History className="h-5 w-5" />,
        title: 'Audit trail',
        body: 'A reconstructable history of material actions.',
        detail: [
          'Actor, role, timestamp and detail recorded against each material event',
          'Case-level event history visible inside the case workspace',
          'Distinct event types for workflow, documents, disputes, notifications and recommendations',
        ],
      },
    ],
  },
  {
    heading: 'Intelligence',
    intro: 'Analysis produced from the evidence already on the record.',
    features: [
      {
        icon: <Gauge className="h-5 w-5" />,
        title: 'Risk assessment',
        body: 'Deterministic scoring with the contributing factors shown.',
        detail: [
          'Composite score from schedule deviation, dependency stalls, document gaps and disputes',
          'Per-factor contribution and weight, so the score can be unpacked',
          'Band thresholds held as editable policy rather than fixed constants',
        ],
      },
      {
        icon: <Timer className="h-5 w-5" />,
        title: 'Delay prediction',
        body: 'Projected completion derived from observed velocity along the dependency graph.',
        detail: [
          'Methodology stated alongside the estimate',
          'Confidence expressed through evidence sufficiency, not false precision',
          'Statutory baseline shown where historical velocity is unavailable',
        ],
      },
      {
        icon: <Network className="h-5 w-5" />,
        title: 'Bottleneck detection',
        body: 'Cross-case identification of where work is pooling.',
        detail: [
          'Ranking by severity and reach across the portfolio',
          'Drill-through from the systemic pattern to the contributing cases',
        ],
      },
      {
        icon: <Search className="h-5 w-5" />,
        title: 'Root cause analysis',
        body: 'Classification of why a case is stalled, with evidence attached.',
        detail: [
          'Categories such as workflow dependency, documentation, approval, dispute, survey and external factors',
          'Immediate cause, contributing factor, upstream cause and data-quality limitations distinguished',
          'Confidence expressed honestly, including when evidence is thin',
        ],
      },
      {
        icon: <Waypoints className="h-5 w-5" />,
        title: 'Downstream impact',
        body: 'What a stall threatens next.',
        detail: [
          'Direct and propagated delay across dependent stages',
          'Impact on dependent cases and on project milestones',
          'Presented as a dependency graph rather than a flat list',
        ],
      },
      {
        icon: <CheckCircle2 className="h-5 w-5" />,
        title: 'Recommendations',
        body: 'Suggested actions with an explicit, server-enforced lifecycle.',
        detail: [
          'Proposed → accepted / rejected → implemented → completed',
          'Every action available in the interface is one the server currently permits',
          'Observed outcome recorded afterwards as measured, officer-reported or insufficient evidence',
        ],
      },
      {
        icon: <Brain className="h-5 w-5" />,
        title: 'Scenario simulation',
        body: 'Evaluate a proposed intervention before committing to it.',
        detail: [
          'Actions such as compressing a stage duration, fast-tracking a hearing or resolving a blockage',
          'Comparison of projected outcomes against the current trajectory',
          'Simulations stored against the case for later reference',
        ],
      },
    ],
  },
  {
    heading: 'Operations & oversight',
    intro: 'Keeping people informed and the portfolio accountable.',
    features: [
      {
        icon: <Bell className="h-5 w-5" />,
        title: 'Notifications',
        body: 'Severity-ranked operational alerts with a real lifecycle.',
        detail: [
          'Event types covering overdue stages, critical risk, blocked dependencies, document backlogs, disputes, stale data and unresolved recommendations',
          'Acknowledge, resolve, dismiss and escalate actions',
          'Counts computed server-side — an empty system reports zero',
        ],
      },
      {
        icon: <Map className="h-5 w-5" />,
        title: 'GIS & spatial intelligence',
        body: 'Map workspace with real administrative filtering.',
        detail: [
          'Case, project and parcel layers with honest zero-record states',
          'Administrative filters that change the actual query, not just the label',
          'Parcel boundary editing and GeoJSON import with validation',
          'Thematic overlays presented as visual context rather than as measurements',
        ],
      },
      {
        icon: <BarChart3 className="h-5 w-5" />,
        title: 'Portfolio analytics',
        body: 'Overview, delay, risk, bottleneck, trend, geography and outcome views.',
        detail: [
          'Filters backed by the dimensions the data actually contains',
          'Evidence-sufficiency labels on every metric',
          'Geographic drill-down from national to state, district, project and case',
          'Observed-outcome tracking across the simulated → proposed → accepted → implemented → observed chain',
        ],
      },
      {
        icon: <Layers className="h-5 w-5" />,
        title: 'Workspace & navigation',
        body: 'Multi-surface working without losing your place.',
        detail: [
          'Open cases and projects as workspace tabs and switch between them',
          'In-page tabs are addressable URLs, so a specific view can be linked and reloaded',
          'Global search routes into the case registry filter',
        ],
      },
      {
        icon: <BookOpen className="h-5 w-5" />,
        title: 'Provenance & data quality',
        body: 'Where a value came from and how fresh it is.',
        detail: [
          'Source registry with operational status per provider',
          'Freshness states so stale external data is visible rather than assumed current',
          'Discrepancy detection across sources with an acknowledgement workflow',
        ],
      },
    ],
  },
];

export const FeaturesPage: React.FC = () => (
  <PublicPageLayout metaKey="features">
    <PageHero
      metaKey="features"
      lead="Every capability described below corresponds to a working module of the application. Nothing here is a roadmap item, and nothing is described as supported unless it exists."
    />

    {FEATURE_GROUPS.map((group, groupIndex) => (
      <PublicSection
        key={group.heading}
        eyebrow={group.heading}
        title={group.heading}
        lead={group.intro}
        tone={groupIndex % 2 === 1 ? 'white' : 'canvas'}
      >
        <PublicGrid cols={3}>
          {group.features.map((feature) => (
            <PublicCard
              key={feature.title}
              icon={<IconPlate tone="blue">{feature.icon}</IconPlate>}
              title={feature.title}
              description={feature.body}
            >
              <ul className="space-y-2">
                {feature.detail.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gov-navy/40" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </PublicCard>
          ))}
        </PublicGrid>
      </PublicSection>
    ))}

    <PublicSection eyebrow="Important" title="How intelligence outputs should be read" tone="white">
      <DecisionSupportNotice />
      <div className="mt-5">
        <Link
          to={getRouteById('public.decisionSupport').path}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gov-navy hover:underline"
        >
          Decision-support in detail
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PublicSection>

    <CtaBand
      title="Explore it in the application"
      description="Sign in with an account issued for your department to see these capabilities against live case data."
      primaryLabel="Sign In"
      primaryTo={getRouteById('auth.login').path}
      secondaryLabel="How It Works"
      secondaryTo={getRouteById('public.howItWorks').path}
    />
  </PublicPageLayout>
);

export default FeaturesPage;
