import React, { useEffect, useState } from 'react';
import { CaseDispute, DisputeType, DisputeStatus, Parcel } from '../../../shared/types';
import { fetchCaseDisputes, createCaseDispute, updateCaseDispute } from '../../lib/api';
import {
  DISPUTE_STATUS_VALUES,
  DISPUTE_TYPE_VALUES,
  disputeStatusLabel,
  disputeTypeLabel,
} from '../../lib/domainLabels';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import {
  Scale,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  Plus,
  Gavel,
  Clock,
} from 'lucide-react';

interface DisputesTabProps {
  caseId: string;
  parcels?: Parcel[];
  onDisputeUpdated?: () => void;
}

export const DisputesTab: React.FC<DisputesTabProps> = ({
  caseId,
  parcels = [],
  onDisputeUpdated,
}) => {
  const { activePersona } = useAuth();
  const [disputes, setDisputes] = useState<CaseDispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New dispute modal / form toggle
  const [showAddModal, setShowAddModal] = useState(false);
  const [claimantName, setClaimantName] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [disputeType, setDisputeType] = useState<DisputeType>('statutory_eligibility');
  const [description, setDescription] = useState('');
  const [hearingDate, setHearingDate] = useState('');
  const [courtCaseNumber, setCourtCaseNumber] = useState('');
  const [stayOrderIssued, setStayOrderIssued] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolution modal
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<DisputeStatus>('settled');
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    loadDisputes();
  }, [caseId]);

  const loadDisputes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchCaseDisputes(caseId);
      setDisputes(res.disputes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load case disputes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimantName || !description) return;
    setIsSubmitting(true);
    try {
      await createCaseDispute(caseId, {
        complainant_name: claimantName,
        claimant_name: claimantName,
        parcel_id: parcelId || undefined,
        dispute_type: disputeType,
        description,
        hearing_date: hearingDate || undefined,
        court_case_number: courtCaseNumber || undefined,
        stay_order_issued: stayOrderIssued,
        status: stayOrderIssued ? 'referred_to_authority' : 'filed',
        priority: stayOrderIssued ? 'critical' : 'medium',
      });
      setShowAddModal(false);
      setClaimantName('');
      setDescription('');
      setHearingDate('');
      setCourtCaseNumber('');
      setStayOrderIssued(false);
      await loadDisputes();
      if (onDisputeUpdated) onDisputeUpdated();
    } catch (err: any) {
      alert(`Failed to log objection: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (disputeId: string) => {
    try {
      await updateCaseDispute(caseId, disputeId, {
        status: resolutionStatus,
        resolution_notes: resolutionNotes,
      });
      setResolvingId(null);
      setResolutionNotes('');
      await loadDisputes();
      if (onDisputeUpdated) onDisputeUpdated();
    } catch (err: any) {
      alert(`Failed to update dispute: ${err.message}`);
    }
  };

  // Type labels come from the central registry so the UI can never disagree
  // with the enum the API accepts.
  const getDisputeTypeLabel = (type: DisputeType) => disputeTypeLabel(type);

  const getStatusBadge = (status: DisputeStatus, stayOrder?: boolean) => {
    if (stayOrder || status === 'referred_to_authority') {
      return (
        <span className="flex items-center gap-1 font-bold text-red-800 bg-red-100 border border-red-300 px-2 py-0.5 rounded text-[11px]">
          <AlertOctagon className="h-3 w-3" /> JUDICIAL / TRIBUNAL STAY
        </span>
      );
    }
    if (status === 'settled' || status === 'dismissed') {
      return (
        <span className="flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded text-[11px]">
          <CheckCircle2 className="h-3 w-3" /> {status.replace('_', ' ').toUpperCase()}
        </span>
      );
    }
    if (status === 'hearing_scheduled' || status === 'under_investigation') {
      return (
        <span className="flex items-center gap-1 font-semibold text-blue-800 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded text-[11px]">
          <Clock className="h-3 w-3" /> {status.replace('_', ' ').toUpperCase()}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-[11px]">
        <Scale className="h-3 w-3" /> FILED / ACTIVE
      </span>
    );
  };

  const activeCount = disputes.filter((d) => d.status !== 'settled' && d.status !== 'dismissed').length;
  const stayCount = disputes.filter((d) => d.stay_order_issued || d.status === 'referred_to_authority').length;

  return (
    <div className="space-y-4">
      {/* Header card with metrics and add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="font-bold text-gov-slate text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-gov-navy" />
            Statutory Objections &amp; Parcel Litigation Register
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Formal registry for Section 15 objections, cadastral boundary conflicts, and judicial stays.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span>Active: <strong className="text-gov-slate">{activeCount}</strong></span>
            {stayCount > 0 && (
              <span className="text-red-700 font-bold flex items-center gap-1">
                <AlertOctagon className="h-3.5 w-3.5" /> {stayCount} Stay(s)
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> File Objection / Dispute
          </Button>
        </div>
      </div>

      {/* Main Dispute List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading statutory dispute records...</div>
      ) : disputes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-xs">
            <Scale className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <h4 className="font-bold text-gov-slate text-sm">No Statutory Objections or Disputes Filed</h4>
            <p className="text-slate-500 mt-1 max-w-md mx-auto">
              All cadastral parcels are currently clear of recorded Section 15 objections, title conflicts, or judicial stay orders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {disputes.map((disp) => {
            const linkedParcel = parcels.find((p) => p.id === disp.parcel_id);
            const isStay = disp.stay_order_issued || disp.status === 'referred_to_authority';
            const displayName = disp.complainant_name || disp.claimant_name || 'Petitioner';

            return (
              <Card
                key={disp.id}
                className={`transition-all ${
                  isStay ? 'border-red-300 bg-red-50/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(disp.status, disp.stay_order_issued)}
                        <span className="font-bold text-gov-slate text-sm">{displayName}</span>
                        {disp.court_case_number && (
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            Court Ref: {disp.court_case_number}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600 font-medium">
                        Type: <span className="text-gov-navy">{getDisputeTypeLabel(disp.dispute_type)}</span>
                        {linkedParcel && (
                          <span className="ml-2 text-slate-500">
                            • Parcel Survey No: <strong className="text-gov-slate">{linkedParcel.survey_number}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-500 shrink-0">
                      <div>Filing Date: <span className="font-mono text-gov-slate">{disp.filing_date}</span></div>
                      {disp.hearing_date && (
                        <div className="text-blue-700 font-semibold flex items-center justify-end gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" /> Hearing: {disp.hearing_date}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-700 bg-white p-2.5 rounded border border-slate-200 text-xs">
                    {disp.description}
                  </p>

                  {disp.resolution_notes && (
                    <div className="bg-emerald-50/80 p-2 rounded border border-emerald-200 text-emerald-900 text-[11px]">
                      <strong>Resolution / Hearing Finding:</strong> {disp.resolution_notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400">
                      Logged by: {disp.logged_by || '—'} • ID: {disp.id.slice(0, 10)}
                    </span>

                    {disp.status !== 'settled' && disp.status !== 'dismissed' && (
                      <div>
                        {resolvingId === disp.id ? (
                          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                            <select
                              value={resolutionStatus}
                              onChange={(e) => setResolutionStatus(e.target.value as DisputeStatus)}
                              className="rounded border border-slate-300 p-1 text-xs bg-white"
                            >
                              {/*
                                Every resolution target is a real `DisputeStatus`
                                member sourced from the central registry; the two
                                intake statuses (filed / under_review) are not
                                offered because they are not resolutions.
                              */}
                              {DISPUTE_STATUS_VALUES.filter(
                                (s) => s !== 'filed' && s !== 'under_review'
                              ).map((s) => (
                                <option key={s} value={s}>
                                  {disputeStatusLabel(s)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Finding notes / Order ref"
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              className="w-48 rounded border border-slate-300 p-1 text-xs bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(disp.id)}
                              className="px-2 py-1 text-[11px] font-semibold text-white bg-gov-navy rounded hover:bg-gov-navy-light"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setResolvingId(null)}
                              className="text-[10px] text-slate-500 underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setResolvingId(disp.id);
                              setResolutionStatus('settled');
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium text-gov-navy bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 flex items-center gap-1"
                          >
                            <Gavel className="h-3 w-3" /> Update Hearing / Outcome
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dispute Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-gov-slate text-sm flex items-center gap-2">
                <Scale className="h-4 w-4 text-gov-navy" />
                File Statutory Objection or Parcel Dispute
              </h4>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDispute} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Claimant / Petitioner Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={claimantName}
                  onChange={(e) => setClaimantName(e.target.value)}
                  placeholder="e.g. Ramesh Patel &amp; Co-sharers"
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dispute Classification</label>
                  <select
                    value={disputeType}
                    onChange={(e) => setDisputeType(e.target.value as DisputeType)}
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none bg-white"
                  >
                    {DISPUTE_TYPE_VALUES.map((t) => (
                      <option key={t} value={t}>
                        {disputeTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Affected Parcel (Optional)</label>
                  <select
                    value={parcelId}
                    onChange={(e) => setParcelId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none bg-white"
                  >
                    <option value="">Case-wide / Not Parcel-Specific</option>
                    {parcels.map((p) => (
                      <option key={p.id} value={p.id}>
                        Survey #{p.survey_number} ({p.area_acres} ac)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hearing Date (Optional)</label>
                  <input
                    type="date"
                    value={hearingDate}
                    onChange={(e) => setHearingDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Court Case Ref (Optional)</label>
                  <input
                    type="text"
                    value={courtCaseNumber}
                    onChange={(e) => setCourtCaseNumber(e.target.value)}
                    placeholder="e.g. WP-2026/894 HC"
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Objection / Dispute Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail petitioner grounds of objection under Section 15 or civil suit particulars..."
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:border-gov-navy focus:outline-none"
                />
              </div>

              <div className="rounded-lg bg-red-50 p-2.5 border border-red-200">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-red-900">
                  <input
                    type="checkbox"
                    checked={stayOrderIssued}
                    onChange={(e) => setStayOrderIssued(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span>Judicial Stay Order Issued (Arrests Award &amp; Possession)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Record in Statutory Register
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
