import React, { useEffect, useState } from 'react';
import { fetchWorkflows } from '../lib/api';
import { Workflow } from '../../shared/types';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import { GitBranch, Clock, Shield, FileCheck, Layers } from 'lucide-react';

export const WorkflowConfigPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWorkflows();
      setWorkflows(res.workflows);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflows');
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">Loading configurable workflow models...</p>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Workflow Service Error"
        description={error}
        actionLabel="Retry"
        onAction={loadWorkflows}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-gov-slate tracking-tight">
          Configurable Workflow Engine
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Dynamic workflow templates governing statutory stages, SLA durations, document prerequisites, and dependencies.
        </p>
      </div>

      {/* Workflows List */}
      <div className="space-y-6">
        {workflows.map((wf) => (
          <Card key={wf.id} className="border-slate-200">
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gov-slate">{wf.name}</span>
                  <Badge variant="navy">v{wf.version}</Badge>
                  <span className="font-mono text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border">
                    {wf.code}
                  </span>
                </div>
              }
              subtitle={wf.description || `Legal Framework: ${wf.legal_framework || 'Statutory'}`}
            />
            <CardContent>
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Sequential Workflow Stages &amp; SLAs
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(wf.stages || []).map((stage) => (
                    <div
                      key={stage.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gov-navy text-white text-[10px] font-bold">
                          {stage.stage_number}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{stage.code}</span>
                      </div>

                      <h4 className="text-xs font-bold text-gov-slate line-clamp-1">{stage.title}</h4>
                      {stage.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2">{stage.description}</p>
                      )}

                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-600">
                        <div className="flex items-center gap-1 font-semibold text-gov-navy">
                          <Clock className="h-3 w-3" />
                          <span>{stage.default_duration_days} Days SLA</span>
                        </div>
                        <div className="capitalize text-slate-500">
                          Role: <strong>{stage.required_role || 'LAO'}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
