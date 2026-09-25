import React from 'react';
import { Compass, LayoutDashboard, FileText } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Link, getRouteById } from '../router';

/**
 * Terminal catch-all surface for unknown URLs.
 *
 * This exists so that a mistyped or stale deep link degrades into a clear,
 * navigable state instead of a blank viewport.
 */
export const NotFoundPage: React.FC = () => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-10 text-center space-y-4">
      <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
        <Compass className="h-6 w-6 text-slate-400" />
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-bold text-gov-slate tracking-tight">Route Not Found</h1>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          The requested address does not correspond to any registered workspace surface. It may have
          been mistyped, or it may refer to a view that no longer exists.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Link to={getRouteById('module.dashboard').path} className="inline-flex">
          <Button size="sm" leftIcon={<LayoutDashboard className="h-4 w-4" />}>
            Operational Dashboard
          </Button>
        </Link>
        <Link to={getRouteById('module.cases').path} className="inline-flex">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileText className="h-4 w-4" />}
          >
            Case Registry
          </Button>
        </Link>
      </div>
    </div>
  );
};
