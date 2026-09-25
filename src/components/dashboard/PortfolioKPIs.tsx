import React from 'react';
import { PortfolioOperationsData, PortfolioFilterParams } from '../../../shared/types';
import { Card } from '../common/Card';
import {
  FolderKanban,
  Clock,
  ShieldAlert,
  AlertTriangle,
  GitPullRequest,
  MapPin,
  TrendingUp,
  Flame,
} from 'lucide-react';

interface PortfolioKPIsProps {
  summary: PortfolioOperationsData['summary'];
  activeFilters: PortfolioFilterParams;
  onFilterChange: (key: keyof PortfolioFilterParams, value: string | undefined) => void;
  onSelectViewTab?: (tab: 'overview' | 'map' | 'bottlenecks' | 'slas') => void;
}

export const PortfolioKPIs: React.FC<PortfolioKPIsProps> = ({
  summary,
  activeFilters,
  onFilterChange,
  onSelectViewTab,
}) => {
  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const isDelayedFilterActive = activeFilters.status === 'delayed';
  const isRiskFilterActive = activeFilters.risk_level === 'critical' || activeFilters.risk_level === 'high';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {/* 1. Total Active Cases */}
      <Card
        hoverEffect
        onClick={() => onFilterChange('status', activeFilters.status === 'active' ? undefined : 'active')}
        className={`p-3.5 border-l-4 cursor-pointer transition-all ${
          activeFilters.status === 'active' ? 'ring-2 ring-gov-navy border-l-gov-navy' : 'border-l-gov-navy'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Active Cases</span>
          <FolderKanban className="h-3.5 w-3.5 text-gov-navy" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-gov-slate">{summary.active_cases}</div>
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">
          Total: <strong className="text-gov-slate">{summary.total_cases}</strong> recorded
        </div>
      </Card>

      {/* 2. Delayed Cases */}
      <Card
        hoverEffect
        onClick={() => onFilterChange('status', isDelayedFilterActive ? undefined : 'delayed')}
        className={`p-3.5 border-l-4 cursor-pointer transition-all ${
          isDelayedFilterActive ? 'ring-2 ring-gov-red border-l-gov-red bg-red-50/20' : 'border-l-gov-red'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Delayed Cases</span>
          <Clock className="h-3.5 w-3.5 text-gov-red" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-gov-red">{summary.delayed_cases}</div>
        <div className="mt-0.5 text-[10px] text-gov-red font-medium truncate">
          +{summary.total_delay_days_accumulated}d SLA Slippage
        </div>
      </Card>

      {/* 3. At-Risk Portfolio */}
      <Card
        hoverEffect
        onClick={() => onFilterChange('risk_level', isRiskFilterActive ? undefined : 'high')}
        className={`p-3.5 border-l-4 cursor-pointer transition-all ${
          isRiskFilterActive ? 'ring-2 ring-amber-500 border-l-amber-500 bg-amber-50/20' : 'border-l-amber-500'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>High/Critical Risk</span>
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-amber-700">{summary.at_risk_cases}</div>
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">Calculated high risk score</div>
      </Card>

      {/* 4. Active Bottlenecks */}
      <Card
        hoverEffect
        onClick={() => onSelectViewTab && onSelectViewTab('bottlenecks')}
        className="p-3.5 border-l-4 border-l-orange-500 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Bottlenecks</span>
          <GitPullRequest className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-gov-slate">{summary.active_bottlenecks_count}</div>
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">Systemic friction loci</div>
      </Card>

      {/* 5. Case Attention Queue Count */}
      <Card
        hoverEffect
        onClick={() => onSelectViewTab && onSelectViewTab('overview')}
        className="p-3.5 border-l-4 border-l-purple-600 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Action Queue</span>
          <Flame className="h-3.5 w-3.5 text-purple-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-purple-800">{summary.attention_queue_count}</div>
        <div className="mt-0.5 text-[10px] text-purple-700 font-medium truncate">Officer Review Req.</div>
      </Card>

      {/* 6. Total Land Area */}
      <Card className="p-3.5 border-l-4 border-l-gov-emerald">
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Total Land</span>
          <MapPin className="h-3.5 w-3.5 text-gov-emerald" />
        </div>
        <div className="mt-1.5 text-xl font-bold text-gov-slate">
          {summary.total_area_hectares} <span className="text-xs font-normal text-slate-400">Ha</span>
        </div>
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">
          Avg Progress: <strong>{summary.average_case_progress}%</strong>
        </div>
      </Card>

      {/* 7. Compensation Allocated */}
      <Card className="p-3.5 border-l-4 border-l-teal-600">
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
          <span>Compensation</span>
          <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
        </div>
        <div className="mt-1.5 text-sm font-bold text-gov-slate truncate">
          {formatCurrency(summary.total_compensation_allocated)}
        </div>
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">Sanctioned statutory fund</div>
      </Card>
    </div>
  );
};
