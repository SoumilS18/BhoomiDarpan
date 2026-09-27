import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { initializeCaseWorkflowPreset } from '../../lib/api';
import {
  GitBranch,
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  Sparkles,
  Building,
  Scale,
  Zap,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface CaseWorkflowCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseTitle: string;
  initialStartDate?: string;
  onWorkflowCreated: () => void;
}

export const CaseWorkflowCreateModal: React.FC<CaseWorkflowCreateModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseTitle,
  initialStartDate,
  onWorkflowCreated,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<
    'rfctlarr_statutory_2013' | 'direct_purchase_consent' | 'nhai_fasttrack_highway' | 'custom'
  >('rfctlarr_statutory_2013');
  const [startDate, setStartDate] = useState(
    initialStartDate || new Date().toISOString().split('T')[0]
  );
  const [customStages, setCustomStages] = useState<
    Array<{
      title: string;
      description: string;
      default_duration_days: number;
      required_role: string;
      expected_end_date?: string;
    }>
  >([
    {
      title: 'Initial Landowner Notification & Public Notice',
      description: 'Formal notification issued to village panchayat and recorded landholders.',
      default_duration_days: 30,
      required_role: 'lao',
    },
    {
      title: 'Joint Field Demarcation & Boundary Verification',
      description: 'DGPS georeferencing and physical peg marking with revenue patwari.',
      default_duration_days: 25,
      required_role: 'revenue_inspector',
    },
    {
      title: 'Statutory Rate Fixing & Award Declaration',
      description: 'Competent Authority compensation determination decree.',
      default_duration_days: 45,
      required_role: 'lao',
    },
    {
      title: 'DBT PFMS Disbursement & Site Handover',
      description: 'Direct bank transfer of award sum and formal possession taking.',
      default_duration_days: 15,
      required_role: 'lao',
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetOptions = [
    {
      id: 'rfctlarr_statutory_2013',
      name: 'RFCTLARR Act 2013 Statutory Standard',
      icon: Scale,
      color: 'blue',
      badge: '7 Stages • Statutory Mandate',
      description:
        'Standard 7-stage statutory lifecycle with Section 11 Notification, SIA & R&R Scheme, Section 15 Hearing, Section 19 Declaration, Cadastral Survey, Form-11 Award, and PFMS Disbursement.',
      durationText: '~285 Days Statutory Baseline SLA',
    },
    {
      id: 'direct_purchase_consent',
      name: 'Direct Land Purchase & Consent Agreement',
      icon: Zap,
      color: 'emerald',
      badge: '5 Stages • Fast Track',
      description:
        'Expedited negotiated consent agreement process for mutually agreed purchase with Price Fixing Committee, Title Search, Registered Sale Deed, and Instant DBT.',
      durationText: '~90 Days Accelerated SLA',
    },
    {
      id: 'nhai_fasttrack_highway',
      name: 'NHAI Highway Fast-Track Scheme (NHAI Act 1956)',
      icon: Building,
      color: 'purple',
      badge: '5 Stages • National Highway Corridor',
      description:
        'Fast-track corridor acquisition under Section 3A Intention Notification, 3C Hearing of Objections, 3D Declaration, 3G Compensation Award, and 3H Handover.',
      durationText: '~137 Days Corridor SLA',
    },
    {
      id: 'custom',
      name: 'Custom Configurable Workflow Builder',
      icon: Layers,
      color: 'amber',
      badge: 'Bespoke Stages',
      description:
        'Design a tailored multi-stage workflow with custom milestone names, responsible officer roles, durations, and mentioned target completion dates.',
      durationText: 'User-Defined Milestones',
    },
  ];

  const handleAddCustomStage = () => {
    setCustomStages([
      ...customStages,
      {
        title: `Stage ${customStages.length + 1}: Custom Milestone Task`,
        description: 'Operational task milestone description.',
        default_duration_days: 30,
        required_role: 'lao',
      },
    ]);
  };

  const handleRemoveCustomStage = (index: number) => {
    if (customStages.length <= 1) return;
    setCustomStages(customStages.filter((_, i) => i !== index));
  };

  const handleUpdateCustomStage = (index: number, field: string, value: any) => {
    const updated = [...customStages];
    updated[index] = { ...updated[index], [field]: value };
    setCustomStages(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      await initializeCaseWorkflowPreset(caseId, {
        preset_type: selectedPreset,
        start_date: startDate,
        custom_stages: selectedPreset === 'custom' ? customStages : undefined,
      });

      onWorkflowCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize workflow');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create & Initialize Statutory Workflow"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {/* Intro */}
        <div className="bg-blue-50/70 border border-blue-200/80 p-3.5 rounded-xl flex items-start gap-3">
          <GitBranch className="h-5 w-5 text-gov-navy shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-gov-navy text-xs">
              Configure Workflow Progression for Case: <span className="font-semibold text-slate-800">{caseTitle}</span>
            </h4>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Select a standard statutory framework or configure custom milestone tasks.
              The workflow engine will establish baseline SLAs, prerequisite checklists, and live early/delayed tracking.
            </p>
          </div>
        </div>

        {/* Start Date */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="block text-xs font-bold text-gov-slate">
              Workflow Initiation / Case Start Date
            </label>
            <p className="text-[10px] text-slate-500">
              Chronological date from which subsequent milestone target deadlines are computed.
            </p>
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-gov-navy focus:border-gov-navy"
            required
          />
        </div>

        {/* Preset Selection Cards */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gov-slate uppercase tracking-wider">
            Select Workflow Framework / Template
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presetOptions.map((opt) => {
              const isSelected = selectedPreset === opt.id;
              const Icon = opt.icon;

              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedPreset(opt.id as any)}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-gov-navy bg-blue-50/50 shadow-md ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                          isSelected ? 'bg-gov-navy text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <h4 className="font-bold text-gov-slate text-xs">{opt.name}</h4>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-gov-navy shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mb-2">
                    {opt.description}
                  </p>

                  <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 font-medium">
                    <span className="text-gov-navy">{opt.badge}</span>
                    <span className="text-slate-400">{opt.durationText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom Workflow Stages Builder if custom selected */}
        {selectedPreset === 'custom' && (
          <div className="space-y-3 p-4 bg-amber-50/40 border border-amber-200/80 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-amber-700" />
                  <span>Custom Milestone Tasks ({customStages.length})</span>
                </h4>
                <p className="text-[10px] text-amber-800">
                  Add, re-order, and assign durations to each operational step.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomStage}
                className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Add Task
              </Button>
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {customStages.map((st, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3 rounded-lg border border-amber-200/90 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => handleUpdateCustomStage(idx, 'title', e.target.value)}
                      placeholder="Task Title"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800"
                      required
                    />
                    {customStages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomStage(idx)}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                        title="Remove task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <label className="text-slate-500 whitespace-nowrap">Duration (Days):</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={st.default_duration_days}
                        onChange={(e) =>
                          handleUpdateCustomStage(idx, 'default_duration_days', Number(e.target.value))
                        }
                        className="w-16 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 font-mono"
                        required
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-slate-500 whitespace-nowrap">Officer Role:</label>
                      <select
                        value={st.required_role}
                        onChange={(e) => handleUpdateCustomStage(idx, 'required_role', e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800"
                      >
                        <option value="lao">Land Acquisition Officer (LAO)</option>
                        <option value="revenue_inspector">Revenue Inspector (RI)</option>
                        <option value="project_officer">Project Officer</option>
                        <option value="admin">Competent Authority / Admin</option>
                        <option value="approver">Financial Approver</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            className="bg-gov-navy hover:bg-gov-blue text-white font-semibold shadow-sm"
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {isSubmitting ? 'Generating Workflow...' : 'Create & Initialize Workflow'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
