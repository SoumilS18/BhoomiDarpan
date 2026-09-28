import React from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Info, CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from '../../../router';
import { PUBLIC_CONFIG, PUBLIC_PAGE_META } from '../../../lib/publicConfig';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

/** Centred content column used by every public page. */
export const PublicContainer: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div className={clsx('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
);

/** Narrower column for prose-heavy pages (legal, accessibility, contact). */
export const PublicProseContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">{children}</div>
);

// ---------------------------------------------------------------------------
// Icons & badges
// ---------------------------------------------------------------------------

/** Square institutional icon plate used on cards and capability tiles. */
export const IconPlate: React.FC<{
  children: React.ReactNode;
  tone?: 'navy' | 'blue' | 'amber' | 'emerald' | 'slate';
  className?: string;
}> = ({ children, tone = 'navy', className }) => {
  const tones = {
    navy: 'bg-gov-navy text-white',
    blue: 'bg-gov-blue-soft text-gov-navy border border-gov-navy/15',
    amber: 'bg-amber-50 text-gov-saffron border border-amber-200',
    emerald: 'bg-emerald-50 text-gov-emerald border border-emerald-200',
    slate: 'bg-slate-100 text-slate-600 border border-slate-200',
  };
  return (
    <div
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
        tones[tone],
        className
      )}
      aria-hidden="true"
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page headers
// ---------------------------------------------------------------------------

/**
 * Hero for the landing page: descriptor, operating model, primary routes into
 * the platform. No metrics, no adoption claims, no certification badges.
 */
export const LandingHero: React.FC<{
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}> = ({ primaryAction, secondaryAction }) => (
  <section className="relative overflow-hidden bg-gov-slate text-white">
    {/* Institutional accent bar */}
    <div className="h-1 bg-gov-saffron" aria-hidden="true" />
    <div
      className="absolute inset-0 opacity-[0.18]"
      aria-hidden="true"
      style={{
        backgroundImage:
          'radial-gradient(circle at 15% 20%, #1e3a8a 0%, transparent 45%), radial-gradient(circle at 85% 70%, #2563eb 0%, transparent 45%)',
      }}
    />
    <PublicContainer className="relative py-16 sm:py-20 lg:py-28">
      <div className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          {PUBLIC_CONFIG.nativeName} · BhoomiDarpan
        </p>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          {PUBLIC_CONFIG.descriptor}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
          One operational record for every acquisition case — statutory workflow, document evidence,
          spatial context and predictive intelligence, held together with a complete audit trail.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Operating model">
          {PUBLIC_CONFIG.operatingModel.map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 && (
                <ArrowRight className="hidden h-4 w-4 text-amber-400 sm:block" aria-hidden="true" />
              )}
              <span className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
                {step}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {primaryAction}
          {secondaryAction}
        </div>

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-slate-400">
          {PUBLIC_CONFIG.deploymentStatement}
        </p>
      </div>
    </PublicContainer>
  </section>
);

/** Hero used by every interior public page (About, Features, Privacy, ...). */
export const PageHero: React.FC<{
  metaKey: keyof typeof PUBLIC_PAGE_META;
  eyebrow?: React.ReactNode;
  lead?: React.ReactNode;
}> = ({ metaKey, eyebrow, lead }) => {
  const meta = PUBLIC_PAGE_META[metaKey];
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="h-1 bg-gov-saffron" aria-hidden="true" />
      <PublicContainer className="py-12 sm:py-14">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gov-navy">
          {eyebrow ?? 'BhoomiDarpan'}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gov-slate sm:text-3xl">
          {meta.title}
        </h1>
        {lead && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{lead}</p>}
        {!lead && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            {meta.description}
          </p>
        )}
      </PublicContainer>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Content sections
// ---------------------------------------------------------------------------

export const PublicSection: React.FC<{
  id?: string;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  lead?: React.ReactNode;
  /** `white` alternates against the `canvas` background for rhythm. */
  tone?: 'canvas' | 'white' | 'dark';
  children: React.ReactNode;
  className?: string;
}> = ({ id, eyebrow, title, lead, tone = 'canvas', children, className }) => {
  const tones = {
    canvas: 'bg-gov-canvas',
    white: 'bg-white',
    dark: 'bg-gov-slate text-white',
  };
  return (
    <section id={id} className={clsx('py-12 sm:py-16', tones[tone], className)}>
      <PublicContainer>
        {(eyebrow || title) && (
          <div className="max-w-3xl">
            {eyebrow && (
              <p
                className={clsx(
                  'text-[11px] font-bold uppercase tracking-wider',
                  tone === 'dark' ? 'text-amber-400' : 'text-gov-navy'
                )}
              >
                {eyebrow}
              </p>
            )}
            {title && (
              <h2
                className={clsx(
                  'mt-2 text-2xl font-bold tracking-tight sm:text-3xl',
                  tone === 'dark' ? 'text-white' : 'text-gov-slate'
                )}
              >
                {title}
              </h2>
            )}
            {lead && (
              <p
                className={clsx(
                  'mt-3 text-sm leading-relaxed sm:text-base',
                  tone === 'dark' ? 'text-slate-300' : 'text-slate-600'
                )}
              >
                {lead}
              </p>
            )}
          </div>
        )}
        <div className={clsx({ 'mt-8': eyebrow || title }, className)}>{children}</div>
      </PublicContainer>
    </section>
  );
};

/** Responsive card grid with consistent gap and column width. */
export const PublicGrid: React.FC<{
  cols?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}> = ({ cols = 3, className, children }) => (
  <div
    className={clsx(
      'grid gap-5 sm:grid-cols-2',
      cols === 2 && 'lg:grid-cols-2',
      cols === 3 && 'lg:grid-cols-3',
      cols === 4 && 'lg:grid-cols-4',
      className
    )}
  >
    {children}
  </div>
);

/** Standard content card. */
export const PublicCard: React.FC<{
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, children, className }) => (
  <div
    className={clsx(
      'flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-gov transition-shadow hover:shadow-gov-md',
      className
    )}
  >
    {icon && <div className="mb-3">{icon}</div>}
    <h3 className="text-base font-semibold text-gov-slate">{title}</h3>
    {description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>}
    {children && <div className="mt-3 text-sm text-slate-600">{children}</div>}
  </div>
);

/** Definition-style list used for capability detail and policy sections. */
export const PublicList: React.FC<{ items: React.ReactNode[]; className?: string }> = ({
  items,
  className,
}) => (
  <ul className={clsx('space-y-2.5', className)}>
    {items.map((item, index) => (
      <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gov-emerald" aria-hidden="true" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const NoticeBox: React.FC<{
  tone?: 'info' | 'warning' | 'success';
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'info', title, children, className }) => {
  const tones = {
    info: {
      wrap: 'border-blue-200 bg-blue-50 text-blue-900',
      icon: <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />,
    },
    warning: {
      wrap: 'border-amber-200 bg-amber-50 text-amber-900',
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />,
    },
    success: {
      wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />,
    },
  };
  return (
    <div
      role="note"
      className={clsx('flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm', tones[tone].wrap, className)}
    >
      {tones[tone].icon}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={clsx(title && 'mt-1', 'leading-relaxed')}>{children}</div>
      </div>
    </div>
  );
};

/**
 * Standing decision-support / AI notice. Rendered once per page where AI
 * output is discussed, rather than as an intrusive banner on every screen.
 */
export const DecisionSupportNotice: React.FC<{ className?: string }> = ({ className }) => (
  <NoticeBox tone="info" title="Decision-support notice" className={className}>
    {PUBLIC_CONFIG.decisionSupportNotice}
  </NoticeBox>
);

// ---------------------------------------------------------------------------
// Calls to action
// ---------------------------------------------------------------------------

export const CtaBand: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}> = ({ title, description, primaryLabel, primaryTo, secondaryLabel, secondaryTo }) => (
  <section className="border-t border-slate-200 bg-white py-14">
    <PublicContainer>
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-gov-canvas p-8 sm:p-10 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold tracking-tight text-gov-slate sm:text-2xl">{title}</h2>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            to={primaryTo}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gov-navy px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
          >
            {primaryLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {secondaryLabel && secondaryTo && (
            <Link
              to={secondaryTo}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </PublicContainer>
  </section>
);

// ---------------------------------------------------------------------------
// Long-form / legal prose
// ---------------------------------------------------------------------------

/** Numbered or unnumbered section for privacy, terms and accessibility pages. */
export const LegalSection: React.FC<{
  index?: number;
  heading: React.ReactNode;
  children: React.ReactNode;
}> = ({ index, heading, children }) => (
  <section className="border-b border-slate-200 py-7 last:border-b-0">
    <h2 className="text-lg font-semibold text-gov-slate">
      {index !== undefined && (
        <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-gov-blue-soft px-1.5 text-xs font-bold text-gov-navy">
          {index}
        </span>
      )}
      {heading}
    </h2>
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
  </section>
);

/** Paragraph helper that keeps legal copy line-length and spacing consistent. */
export const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p>{children}</p>
);

/** Bulleted list inside legal prose. */
export const LegalUl: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc space-y-2 pl-5">
    {items.map((item, index) => (
      <li key={index}>{item}</li>
    ))}
  </ul>
);
