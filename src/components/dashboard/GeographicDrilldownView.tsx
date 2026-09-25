import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { fetchPortfolioGeography } from '../../lib/api';
import { GeographicDrilldownNode } from '../../../shared/types';
import {
  MapPin,
  ChevronRight,
  ChevronDown,
  Layers,
  AlertTriangle,
  FolderKanban,
  Clock,
  ShieldAlert,
  Compass,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface GeographicDrilldownViewProps {
  onSelectCase: (caseId: string) => void;
}

export const GeographicDrilldownView: React.FC<GeographicDrilldownViewProps> = ({ onSelectCase }) => {
  const [rootNode, setRootNode] = useState<GeographicDrilldownNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['national-root']));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGeography = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioGeography();
      setRootNode(res.geography);
      // Auto-expand national root and first level children
      const initialExpanded = new Set<string>(['national-root']);
      (res.geography.children || []).forEach((c) => initialExpanded.add(c.id));
      setExpandedNodes(initialExpanded);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate geographic hierarchy');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGeography();
  }, []);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const getMappedBadge = (state: GeographicDrilldownNode['mapped_state']) => {
    switch (state) {
      case 'administrative_enrichment_unavailable':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            LGD Enrichment Unavailable
          </span>
        );
      case 'mapped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Compass className="h-3 w-3 text-emerald-600" />
            Geographically Mapped
          </span>
        );
      case 'unmapped':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Coordinates Awaiting
          </span>
        );
    }
  };

  const renderNode = (node: GeographicDrilldownNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isCase = node.node_type === 'case';
    const cleanCaseId = isCase ? node.id.replace('case-', '') : '';

    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`flex flex-wrap items-center justify-between p-2.5 rounded-lg border transition-all ${
            isCase
              ? 'bg-white hover:bg-blue-50/50 border-slate-200 cursor-pointer ml-6'
              : level === 0
              ? 'bg-gov-navy text-white border-gov-navy font-bold'
              : level === 1
              ? 'bg-slate-100 border-slate-300 font-semibold'
              : 'bg-slate-50 border-slate-200 font-medium ml-3'
          }`}
          onClick={() => {
            if (isCase) {
              onSelectCase(cleanCaseId);
            } else if (hasChildren) {
              toggleExpand(node.id);
            }
          }}
        >
          {/* Left: Expander & Title */}
          <div className="flex items-center gap-2">
            {!isCase && hasChildren && (
              <button
                type="button"
                className="p-1 rounded hover:bg-slate-200/50"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className={`h-4 w-4 ${level === 0 ? 'text-white' : 'text-slate-500'}`} />
                ) : (
                  <ChevronRight className={`h-4 w-4 ${level === 0 ? 'text-white' : 'text-slate-500'}`} />
                )}
              </button>
            )}

            {isCase ? (
              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            ) : (
              <Layers className={`h-3.5 w-3.5 ${level === 0 ? 'text-blue-300' : 'text-gov-navy'}`} />
            )}

            <div className="flex items-center gap-2">
              <span className={`text-xs ${level === 0 ? 'text-white' : 'text-gov-slate'}`}>
                {node.name}
              </span>
              <span
                className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                  level === 0
                    ? 'bg-blue-900 text-blue-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {node.node_type}
              </span>
            </div>

            <div className="ml-2">{getMappedBadge(node.mapped_state)}</div>
          </div>

          {/* Right: Aggregated Metrics */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-3">
              <span className={level === 0 ? 'text-blue-100' : 'text-slate-600'}>
                <strong>{node.metrics.total_cases}</strong> case(s)
              </span>

              {node.metrics.delayed_cases > 0 && (
                <span className="flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">
                  <Clock className="h-3 w-3" />
                  {node.metrics.delayed_cases} delayed
                </span>
              )}

              {node.metrics.high_risk_cases > 0 && (
                <span className="flex items-center gap-1 text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded text-[11px]">
                  <ShieldAlert className="h-3 w-3" />
                  {node.metrics.high_risk_cases} high risk
                </span>
              )}

              <span className={`text-[11px] ${level === 0 ? 'text-blue-200' : 'text-slate-500'}`}>
                {node.metrics.total_area_hectares} ha
              </span>
            </div>

            {isCase && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 py-0 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCase(cleanCaseId);
                }}
                rightIcon={<ExternalLink className="h-3 w-3" />}
              >
                Open Case
              </Button>
            )}
          </div>
        </div>

        {/* Child Nodes */}
        {hasChildren && isExpanded && (
          <div className="space-y-1 pl-2 border-l border-slate-200 ml-3">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-gov-slate flex items-center gap-2">
            <Layers className="h-4 w-4 text-gov-navy" />
            Administrative &amp; Territorial Drill-Down Hierarchy
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Progressive operational breakdown: National &rarr; State &rarr; District &rarr; Acquisition Case.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadGeography}
          leftIcon={<RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh Hierarchy
        </Button>
      </div>

      {isLoading && (
        <Card className="p-12 text-center text-xs text-slate-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gov-navy mx-auto mb-2" />
          Constructing administrative tree and linking case boundaries...
        </Card>
      )}

      {error && (
        <Card className="p-6 border-l-4 border-l-rose-500 bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Geographic Drill-Down Query Error
          </div>
          <p className="text-xs text-rose-600 mt-1">{error}</p>
        </Card>
      )}

      {rootNode && !isLoading && (
        <Card className="p-4 space-y-2">
          {renderNode(rootNode, 0)}
        </Card>
      )}
    </div>
  );
};
