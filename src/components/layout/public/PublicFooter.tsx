import React from 'react';
import { Link, getRouteById } from '../../../router';

const PLATFORM_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/gis-intelligence', label: 'GIS Intelligence' },
  { to: '/decision-support', label: 'Decision Support' },
];

const SECURITY_LEGAL_LINKS = [
  { to: '/security', label: 'Security' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms of Use' },
  { to: '/accessibility', label: 'Accessibility' },
];

const ACCOUNT_LINKS = [
  { to: '/login', label: 'Sign In' },
  { to: '/request-access', label: 'Request Access' },
  { to: '/activate-account', label: 'Activate Account' },
  { to: '/contact', label: 'Contact' },
];

function FooterLinkColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => {
          const route = getRouteById(
            link.to === '/about'
              ? 'public.about'
              : link.to === '/features'
                ? 'public.features'
                : link.to === '/how-it-works'
                  ? 'public.howItWorks'
                  : link.to === '/gis-intelligence'
                    ? 'public.gisIntelligence'
                    : link.to === '/decision-support'
                      ? 'public.decisionSupport'
                      : link.to === '/security'
                        ? 'public.security'
                        : link.to === '/privacy'
                          ? 'public.privacy'
                          : link.to === '/terms'
                            ? 'public.terms'
                            : link.to === '/accessibility'
                              ? 'public.accessibility'
                              : link.to === '/login'
                                ? 'auth.login'
                                : link.to === '/request-access'
                                  ? 'auth.requestAccess'
                                  : link.to === '/activate-account'
                                    ? 'auth.activateAccount'
                                    : 'public.contact'
          );
          return (
            <li key={link.to}>
              <Link
                to={link.to}
                className="text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gov-slate rounded-sm"
                aria-label={route?.title ? `${link.label} — ${route.title}` : link.label}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const PublicFooter: React.FC = () => {
  return (
    <footer className="bg-gov-slate text-slate-200">
      <div className="border-t-4 border-gov-saffron" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gov-navy">
                <svg
                  className="h-5 w-5 text-amber-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                  <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-white">BhoomiDarpan</p>
                <p className="text-[10px] text-gov-navy bg-white/10 px-2 py-0.5 rounded border border-white/20 inline-block mt-0.5">
                  भूमिदर्पण
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400 max-w-sm">
              A land acquisition intelligence and decision-support platform that unifies case
              monitoring, workflow tracking, GIS context, and predictive risk analysis for
              authorized officials.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500 max-w-sm">
              Decision-support outputs (predictions, risk assessments, recommendations) assist —
              but do not replace — authorized human, legal, and administrative decisions.
            </p>
          </div>

          <FooterLinkColumn title="Platform" links={PLATFORM_LINKS} />
          <FooterLinkColumn title="Security & Legal" links={SECURITY_LEGAL_LINKS} />
          <FooterLinkColumn title="Account & Support" links={ACCOUNT_LINKS} />
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} BhoomiDarpan. Internal platform for authorized officers.
          </p>
          <p className="text-xs text-slate-500">
            Not an official Government of India website. Access is restricted to authorized personnel.
          </p>
        </div>
      </div>
    </footer>
  );
};
