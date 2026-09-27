import React, { useEffect } from 'react';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { PUBLIC_PAGE_META, PUBLIC_CONFIG } from '../../../lib/publicConfig';

/**
 * Canonical shell for every world-readable website page: public header,
 * scrollable content region, public footer.
 *
 * Deliberately separate from the application shell in `App.tsx` — a public
 * visitor must never see the operational sidebar, workspace bar or module
 * header. The two shells share the same design tokens (gov palette, type
 * scale, button/input treatments) so the platform reads as one product.
 */
export const PublicPageLayout: React.FC<{
  /** Stable key into `PUBLIC_PAGE_META` for the document title. */
  metaKey?: keyof typeof PUBLIC_PAGE_META;
  children: React.ReactNode;
}> = ({ metaKey, children }) => {
  useEffect(() => {
    const meta = metaKey ? PUBLIC_PAGE_META[metaKey] : undefined;
    document.title = meta ? `${meta.title}` : `${PUBLIC_CONFIG.name}`;
    return () => {
      document.title = `${PUBLIC_CONFIG.name} | Land Acquisition Decision-Support Platform`;
    };
  }, [metaKey]);

  return (
    <div className="flex min-h-screen flex-col bg-gov-canvas text-gov-slate">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gov-navy focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <PublicHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
};
