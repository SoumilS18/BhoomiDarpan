import React, { useState } from 'react';
import { AcquisitionCase, CaseStageInstance } from '../../../shared/types';
import { TimelineGantt } from '../workflow/TimelineGantt';
import { StageAdvanceModal } from '../workflow/StageAdvanceModal';
import { StageScheduleModal } from '../workflow/StageScheduleModal';
import { CaseWorkflowCreateModal } from '../workflow/CaseWorkflowCreateModal';
import { Card, CardHeader, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { calculateDaysBetween } from '../../../shared/utils/dateUtils';
import {
  GitBranch,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Settings,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Scale,
  Zap,
  Building,
  Layers,
  Award,
} from 'lucide-react';

interface CaseWorkflowTabProps {
  caseItem: AcquisitionCase;
  onRefresh: () => void;
}

export const CaseWorkflowTab: React.FC<CaseWorkflowTabProps> = ({
  caseItem,
  onRefresh,
}) => {
  const [selectedAdvanceStage, setSelectedAdvanceStage] = useState<CaseStageInstance | null>(null);
  const [selectedScheduleStage, setSelectedScheduleStage] = useState<CaseStageInstance | null>(null);
  const [isCreateWorkflowModalOpen, setIsCreateWorkflowModalOpen] = useState(false);

  const stages = caseItem.stage_instances || [];
  const totalStages = stages.length;
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const inProgressStages = stages.filter((s) => s.status === 'in_progress').length;
  const blockedStages = stages.filter((s) => s.status === 'blocked').length;
  const notStartedStages = stages.filter((s) => s.status === 'not_started').length;

  const completionPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  // Schedule status
  const metrics = caseItem.calculated_metrics;
  const isDelayed = metrics?.is_delayed || caseItem.status === 'delayed';
  const delayDays = metrics?.net_delay_days || 0;
  const todayStr = new Date().toISOString().split('T')[0];

  // Case target date vs today
  let daysRemaining = 0;
  if (caseItem.expected_completion_date) {
    daysRemaining = calculateDaysBetween(todayStr, caseItem.expected_completion_date);
  }

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* 1. CASE COMPLETION & TIMELINE COCKPIT HEADER */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-gov space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-50 text-gov-navy flex items-center justify-center font-bold text-xs">
                <GitBranch className="h-4 w-4 text-gov-navy" />
              </div>
              <h3 className="font-bold text-gov-slate text-sm">
                Case Workflow &amp; Statutory Milestone Completion
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live tracking of milestone progress, statutory target SLA dates, and dynamic delay/early deviations.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateWorkflowModalOpen(true)}
              className="text-xs bg-white text-slate-700 hover:bg-slate-50 font-semibold"
              leftIcon={<Settings className="h-3.5 w-3.5 text-gov-navy" />}
            >
              {totalStages > 0 ? 'Configure / Change Workflow' : 'Create Workflow'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="text-xs text-slate-600 hover:text-slate-900"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Sync Timeline
            </Button>
          </div>
        </div>

        {/* Vital Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Progress Bar & Completion % */}
          <div className="md:col-span-2 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gov-slate uppercase text-[11px] tracking-wider">
                Overall Case Completion
              </span>
              <span className="font-mono font-bold text-sm text-gov-navy">
                {completedStages} of {totalStages} Tasks ({completionPct}%)
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completionPct === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                    : isDelayed
                    ? 'bg-gradient-to-r from-amber-500 to-red-500'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                }`}
                style={{ width: `${Math.max(completionPct, totalStages > 0 ? 4 : 0)}%` }}
              />
            </div>

            {/* Task Breakdown Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                <CheckCircle2 className="h-3 w-3" />
                <span>{completedStages} Completed</span>
              </span>
              <span className="inline-flex items-center gap-1 text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-medium">
                <Clock className="h-3 w-3" />
                <span>{inProgressStages} In Progress</span>
              </span>
              {blockedStages > 0 && (
                <span className="inline-flex items-center gap-1 text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{blockedStages} Blocked</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                <span>{notStartedStages} Scheduled</span>
              </span>
            </div>
          </div>

          {/* Schedule Health Card */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Case Schedule Status
            </span>
            <div className="my-1">
              {completionPct === 100 ? (
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-sm">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <span>Workflow Concluded</span>
                </div>
              ) : isDelayed ? (
                <div className="flex items-center gap-1.5 text-gov-red font-bold text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-600 animate-pulse" />
                  <span>+{delayDays} Days Net Delay</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span>On Statutory Schedule</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {completionPct === 100
                ? 'All mandatory statutory milestones fulfilled.'
                : isDelayed
                ? 'Active milestone exceeded target completion SLA.'
                : `${Math.max(0, daysRemaining)} days remaining until target deadline.`}
            </p>
          </div>

          {/* Mentioned Target Completion Date */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Mentioned Target Completion
            </span>
            <div className="my-1 font-mono font-bold text-gov-navy text-sm">
              {caseItem.expected_completion_date || 'Not established'}
            </div>
            <p className="text-[11px] text-slate-500">
              Start Date: <strong className="font-mono text-slate-700">{caseItem.start_date || 'N/A'}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. STAGE PROGRESSION TIMELINE OR INITIALIZATION STUDIO */}
      {/* ========================================================================= */}
      {stages.length > 0 ? (
        <Card className="border-slate-200">
          <CardHeader
            title="Statutory Workflow Progression & Task Timeline"
            subtitle="Detailed stage breakdown, mentioned target dates, responsible roles, and live early/delay indicators"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateWorkflowModalOpen(true)}
                className="bg-gov-navy hover:bg-gov-blue text-white font-semibold text-xs"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Add Custom Milestone Task
              </Button>
            }
          />
          <CardContent>
            <TimelineGantt
              stages={stages}
              onSelectStageForAdvance={(st) => setSelectedAdvanceStage(st)}
              onSelectStageForSchedule={(st) => setSelectedScheduleStage(st)}
            />
          </CardContent>
        </Card>
      ) : (
        /* Empty State: Rich Interactive Workflow Creation Studio */
        <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-8 text-center space-y-5 shadow-xs">
          <div className="h-14 w-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-gov-navy mx-auto">
            <GitBranch className="h-7 w-7" />
          </div>

          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-base font-bold text-gov-slate">
              No Statutory Workflow Initialized
            </h4>
            <p className="text-xs text-slate-500">
              This case currently has no workflow stages initialized. Select a statutory framework preset or build a custom milestone schedule with target dates.
            </p>
          </div>

          {/* 3 Quick Preset Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
            <div
              onClick={() => setIsCreateWorkflowModalOpen(true)}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-gov-navy hover:shadow-md bg-slate-50/50 hover:bg-white cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-7 w-7 rounded bg-blue-100 text-gov-navy flex items-center justify-center">
                  <Scale className="h-4 w-4" />
                </div>
                <h5 className="font-bold text-gov-slate text-xs group-hover:text-gov-navy">
                  RFCTLARR Act 2013
                </h5>
              </div>
              <p className="text-[11px] text-slate-500">
                Standard 7-stage statutory process with Section 11, SIA, hearings, award decree &amp; PFMS.
              </p>
            </div>

            <div
              onClick={() => setIsCreateWorkflowModalOpen(true)}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-gov-navy hover:shadow-md bg-slate-50/50 hover:bg-white cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-7 w-7 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Zap className="h-4 w-4" />
                </div>
                <h5 className="font-bold text-gov-slate text-xs group-hover:text-gov-navy">
                  Direct Consent Purchase
                </h5>
              </div>
              <p className="text-[11px] text-slate-500">
                Accelerated 5-stage negotiated consent agreement for willing landholders.
              </p>
            </div>

            <div
              onClick={() => setIsCreateWorkflowModalOpen(true)}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-gov-navy hover:shadow-md bg-slate-50/50 hover:bg-white cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-7 w-7 rounded bg-purple-100 text-purple-800 flex items-center justify-center">
                  <Building className="h-4 w-4" />
                </div>
                <h5 className="font-bold text-gov-slate text-xs group-hover:text-gov-navy">
                  NHAI Fast-Track
                </h5>
              </div>
              <p className="text-[11px] text-slate-500">
                Corridor acquisition under Section 3A to 3H statutory mandates.
              </p>
            </div>
          </div>

          <div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsCreateWorkflowModalOpen(true)}
              className="bg-gov-navy hover:bg-gov-blue text-white font-semibold shadow-sm px-6"
              leftIcon={<Sparkles className="h-4 w-4 text-amber-400" />}
            >
              Initialize Statutory Workflow Now
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODALS */}
      {/* ========================================================================= */}

      {/* Stage Advance / Complete Modal */}
      <StageAdvanceModal
        isOpen={Boolean(selectedAdvanceStage)}
        onClose={() => setSelectedAdvanceStage(null)}
        caseId={caseItem.id}
        stageInstance={selectedAdvanceStage}
        onStageUpdated={onRefresh}
      />

      {/* Stage Schedule / Mentioned Date Modal */}
      <StageScheduleModal
        isOpen={Boolean(selectedScheduleStage)}
        onClose={() => setSelectedScheduleStage(null)}
        caseId={caseItem.id}
        stageInstance={selectedScheduleStage}
        onScheduleUpdated={onRefresh}
      />

      {/* Case Workflow Create / Preset Modal */}
      <CaseWorkflowCreateModal
        isOpen={isCreateWorkflowModalOpen}
        onClose={() => setIsCreateWorkflowModalOpen(false)}
        caseId={caseItem.id}
        caseTitle={caseItem.title}
        initialStartDate={caseItem.start_date}
        onWorkflowCreated={onRefresh}
      />
    </div>
  );
};
