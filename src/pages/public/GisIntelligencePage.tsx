import React from 'react';
import {
  ArrowRight,
  Crosshair,
  FileText,
  GitBranch,
  Layers,
  Map,
  MapPin,
  Route,
  Ruler,
  Scale,
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

const LAYERS: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Project geography',
    body: 'The corridor or scheme a project covers, shown alongside the cases that fall inside it.',
  },
  {
    icon: <Crosshair className="h-5 w-5" />,
    title: 'Acquisition corridors',
    body: 'The alignment a case is acquiring along, so the geographic scope of a case is unambiguous.',
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    title: 'Parcels',
    body: 'Individual parcel geometry with its acquisition status — identified, notified, valued, awarded, disbursed, possessed or disputed.',
  },
  {
    icon: <Map className="h-5 w-5" />,
    title: 'Administrative geography',
    body: 'State, district and sub-district boundaries from the official LGD hierarchy, used both for context and as a query filter.',
  },
  {
    icon: <Layers className="h-5 w-5" />,
    title: 'Thematic overlays',
    body: 'Sovereign and open thematic layers for land use, hazard and administrative context, presented as visual reference.',
  },
  {
    icon: <Route className="h-5 w-5" />,
    title: 'Proximity & routing',
    body: 'Nearby cases and projects, straight-line distance, and road routing for site-access questions.',
  },
];

export const GisIntelligencePage: React.FC = () => (
  <PublicPageLayout metaKey="gisIntelligence">
    <PageHero
      metaKey="gisIntelligence"
      lead="BhoomiSetu's GIS workspace puts acquisition geography, parcels and administrative context in the same view as the case record — with filters that actually change what is queried."
    />

    <PublicSection eyebrow="Layers" title="What you see on the map" tone="white">
      <PublicGrid cols={3}>
        {LAYERS.map((layer) => (
          <PublicCard key={layer.title} icon={<IconPlate tone="blue">{layer.icon}</IconPlate>} title={layer.title}>
            {layer.body}
          </PublicCard>
        ))}
      </PublicGrid>
    </PublicSection>

    <PublicSection
      eyebrow="Filtering"
      title="Administrative filters are real queries"
      lead="Selecting a state or district does not merely relabel the map — it narrows the underlying case and parcel query, and the side panels update from the same result set."
      tone="white"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-gov-canvas p-6">
          <h3 className="text-base font-semibold text-gov-slate">The cascade</h3>
          <ol className="mt-4 space-y-2.5">
            {[
              'State / UT — official LGD state list',
              'District — districts belonging to the selected state',
              'Sub-district / tehsil — belonging to the selected district',
              'Village — searched server-side within the selected sub-district',
            ].map((line, index) => (
              <li key={line} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gov-navy text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Each tier is scoped to its parent, so districts are never fetched before a state exists
            and villages are never loaded nationally.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">
          <h3 className="text-base font-semibold text-gov-slate">What else can be filtered</h3>
          <div className="mt-4">
            <PublicList
              items={[
                'Case status',
                'Risk level',
                'Mapping state — mapped, partially mapped, unmapped or invalid geometry',
                'Project membership',
                'Map bounds, so only what is in view is requested',
              ]}
            />
          </div>
          <div className="mt-5">
            <NoticeBox tone="info" title="No invented markers">
              If a layer contains no records for the current scope, the map and its panel say so.
              The workspace never fabricates a marker to make a view look populated.
            </NoticeBox>
          </div>
        </div>
      </div>
    </PublicSection>

    <PublicSection eyebrow="Parcels" title="Parcel-level truth, edited in place" tone="white">
      <div className="grid gap-5 lg:grid-cols-3">
        <PublicCard
          icon={<IconPlate tone="navy"><Ruler className="h-5 w-5" /></IconPlate>}
          title="Geometry you can correct"
          description="Draw or edit parcel boundaries directly, or import validated GeoJSON. Invalid geometry is rejected with a specific reason rather than silently accepted."
        />
        <PublicCard
          icon={<IconPlate tone="amber"><Scale className="h-5 w-5" /></IconPlate>}
          title="Status that matches the record"
          description="Each parcel carries an acquisition status consistent with the case timeline, so the map and the case file cannot disagree."
        />
        <PublicCard
          icon={<IconPlate tone="emerald"><FileText className="h-5 w-5" /></IconPlate>}
          title="Mapping state is explicit"
          description="Cases report whether their geometry is mapped, partially mapped, unmapped, invalid, or unavailable because administrative enrichment could not run."
        />
      </div>
    </PublicSection>

    <PublicSection eyebrow="Integrity" title="How spatial data is treated" tone="white">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <NoticeBox tone="warning" title="Thematic overlays are context, not measurement">
          Overlays from external mapping services are visual reference. BhoomiSetu does not convert
          a coloured thematic layer into numeric measurements of area, hazard or land use, and it
          does not present an overlay as a result derived from the case record.
        </NoticeBox>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {[
            {
              title: 'Application data',
              body: 'Case boundaries, parcels and administrative scope come from the application record and the official LGD hierarchy.',
            },
            {
              title: 'External context',
              body: 'Thematic overlays and basemaps come from external mapping services and are labelled as external context.',
            },
            {
              title: 'Derived intelligence',
              body: 'Proximity, clustering and spatial analysis are computed from the application record, and their evidence is shown.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-amber-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gov-slate">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </PublicSection>

    <CtaBand
      title="Open the GIS workspace"
      description="Sign in to explore cases, parcels and administrative geography with live filters."
      primaryLabel="Sign In"
      primaryTo={getRouteById('auth.login').path}
      secondaryLabel="How It Works"
      secondaryTo={getRouteById('public.howItWorks').path}
    />
  </PublicPageLayout>
);

export default GisIntelligencePage;
