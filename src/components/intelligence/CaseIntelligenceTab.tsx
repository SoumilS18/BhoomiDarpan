import React, { useEffect, useState } from 'react';
import { CaseIntelligenceBundle, CaseStageInstance } from '../../../shared/types';
import { api } from '../../lib/api';
import { RiskOverviewCard } from './RiskOverviewCard';
import { BottleneckList } from './BottleneckList';
import { RootCausePanel } from './RootCausePanel';
import { DownstreamImpactView } from './DownstreamImpactView';
import { RecommendationsList } from './RecommendationsList';
import { WhatIfSimulator } from './WhatIfSimulator';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';

interface CaseIntelligenceTabProps {
  caseId: string;
  stages: CaseStageInstance[];
  onCaseUpdated?: () => void;
}

export const CaseIntelligenceTab: React.FC<CaseIntelligenceTabProps> = ({
  caseId,
  stages,
  onCaseUpdated,
}) => {
  const [bundle, setBundle] = useState<CaseIntelligenceBundle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadIntelligence = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.fetchCaseIntelligence(caseId);
      setBundle(data.intelligence);
    } catch (err: any) {
      console.error('Failed to load case intelligence:', err);
      setError(err.message || 'Failed to load intelligence diagnostics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      loadIntelligence();
    }
  }, [caseId]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16 flex flex-col items-center justify-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Executing statistical risk models, DAG critical path analysis, and root-cause attribution...
        </p>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-red-600 font-semibold text-sm">
          <AlertCircle className="h-5 w-5" />
          <span>{error || 'Unable to generate intelligence diagnostics'}</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadIntelligence} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Retry Diagnostic Engine
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gov-navy/5 text-gov-navy rounded-lg border border-gov-navy/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-gov-slate text-sm">Decision Intelligence &amp; Risk Analytics</h3>
            <p className="text-[11px] text-slate-500">
              Continuously monitored predictive risk score, critical path DAG analysis, and advisory interventions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Mathematical Evaluation
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadIntelligence();
              if (onCaseUpdated) onCaseUpdated();
            }}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Re-evaluate
          </Button>
        </div>
      </div>

      {/* 1. Risk Overview Card */}
      <RiskOverviewCard
        assessment={bundle.risk_assessment}
        baselineCompletionDate={bundle.downstream_impact?.baseline_completion_date}
      />

      {/* 2. Bottleneck Detection & Root-Cause Attribution Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BottleneckList bottlenecks={bundle.bottlenecks} />
        <RootCausePanel rootCauses={bundle.root_causes} />
      </div>

      {/* 3. Downstream DAG Impact Analysis */}
      <DownstreamImpactView impact={bundle.downstream_impact} />

      {/* 4. Actionable Advisory Recommendations & Officer Decisions */}
      <RecommendationsList
        recommendations={bundle.recommendations}
        onRecommendationUpdated={() => {
          loadIntelligence();
          if (onCaseUpdated) onCaseUpdated();
        }}
      />

      {/* 5. What-If Scenario Sandbox Simulator */}
      <WhatIfSimulator caseId={caseId} stages={stages} />
    </div>
  );
};
