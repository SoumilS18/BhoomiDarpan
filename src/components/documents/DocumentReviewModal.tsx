import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { processDocument, validateDocument } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CaseDocument, StructuredExtractionData } from '../../../shared/types';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Bot,
  Calendar,
  DollarSign,
  Users,
  AlertTriangle,
  RotateCw,
  FileText,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
} from 'lucide-react';

interface DocumentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CaseDocument | null;
  onRefresh: () => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  isOpen,
  onClose,
  document,
  onRefresh,
}) => {
  if (!document) return null;

  const latestExtraction = document.extractions && document.extractions.length > 0
    ? document.extractions[0]
    : null;

  const rawStructured = latestExtraction?.structured_data || {};
  const humanData = latestExtraction?.human_edited_data;

  // Local state for editing extracted fields
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<StructuredExtractionData>(
    humanData || rawStructured || {}
  );
  const [validationNotes, setValidationNotes] = useState(latestExtraction?.validation_notes || '');
  // Verification is attested by the signed-in officer only — see the note
  // under the field.
  const { activePersona } = useAuth();
  const [actorName] = useState(activePersona.name);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Trigger Gemini server-side extraction
  const handleTriggerAI = async () => {
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await processDocument(document.id);
      if (res.success) {
        setActionSuccess('AI extraction completed! Review the structured legal fields below.');
        onRefresh();
      } else {
        setActionError(res.error || 'Extraction failed.');
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger document extraction.');
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit human validation decision
  const handleValidate = async (status: 'accepted' | 'edited' | 'rejected') => {
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await validateDocument(document.id, {
        validation_status: status,
        human_edited_data: status === 'edited' ? editedData : undefined,
        validation_notes: validationNotes.trim() || undefined,
        actorName,
      });

      setActionSuccess(`Document ${status === 'rejected' ? 'rejected' : 'verified and accepted'}. Audit trail recorded.`);
      setTimeout(() => {
        setIsSubmitting(false);
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || 'Validation submission failed.');
      setIsSubmitting(false);
    }
  };

  const confidenceScore = latestExtraction?.confidence_score
    ? Math.round(latestExtraction.confidence_score * 100)
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Statutory Document Intelligence & Verification"
      subtitle={`Document: ${document.title} (${document.document_type})`}
      maxWidth="4xl"
    >
      <div className="space-y-5">
        {/* Error / Success Feedback */}
        {actionError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Error:</strong> {actionError}
            </div>
          </div>
        )}

        {actionSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div>{actionSuccess}</div>
          </div>
        )}

        {/* Document Header & State Summary */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100/70 border border-blue-200 flex items-center justify-center text-gov-navy shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gov-slate text-sm">{document.title}</span>
                <Badge
                  variant={
                    document.status === 'verified'
                      ? 'emerald'
                      : document.status === 'failed' || document.status === 'rejected'
                      ? 'red'
                      : document.status === 'validation_required'
                      ? 'amber'
                      : 'navy'
                  }
                >
                  {document.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-3">
                <span>MIME: {document.mime_type || 'unspecified'}</span>
                <span>•</span>
                <span>Size: {document.file_size_bytes ? `${(document.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</span>
                <span>•</span>
                <span>Uploaded: {new Date(document.uploaded_at).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Trigger AI / Retry Buttons */}
          <div className="flex items-center gap-2">
            {(document.status === 'uploaded' || document.status === 'failed') && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleTriggerAI}
                disabled={isProcessing}
                leftIcon={<Sparkles className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />}
              >
                {isProcessing ? 'Extracting via Gemini...' : document.status === 'failed' ? 'Retry AI Extraction' : 'Run Gemini Extraction'}
              </Button>
            )}

            {document.file_url && (
              <a
                href={document.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-medium inline-flex items-center gap-1.5"
              >
                View Original File
              </a>
            )}
          </div>
        </div>

        {/* Failed State Notice */}
        {document.status === 'failed' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              <span>AI Extraction Unavailable / Failed</span>
            </div>
            <p className="text-amber-700">
              {document.error_details ||
                'The server-side extraction encountered an error or the Gemini API is not configured. The original uploaded file is safely preserved in storage.'}
            </p>
            <p className="text-slate-600 text-[11px]">
              Per BhoomiDarpan zero-hardcoding policy, no synthetic fake facts are generated. You may retry extraction or proceed with manual statutory review.
            </p>
          </div>
        )}

        {/* Extraction Results (When available) */}
        {latestExtraction && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-gov-navy" />
                <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
                  Extracted Legal Entities &amp; Evidence
                </h4>
                {confidenceScore !== null && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      confidenceScore >= 80
                        ? 'bg-emerald-100 text-emerald-800'
                        : confidenceScore >= 60
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {confidenceScore}% Confidence
                  </span>
                )}
                {latestExtraction.is_verified && (
                  <Badge variant="emerald">HUMAN VERIFIED</Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  leftIcon={<Edit3 className="h-3 w-3" />}
                >
                  {isEditing ? 'Cancel Edits' : 'Edit Extracted Data'}
                </Button>
              </div>
            </div>

            {/* AI Summary */}
            {rawStructured.summary && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs">
                <span className="font-bold text-gov-navy block mb-0.5">Statutory Summary:</span>
                <p className="text-slate-700">{rawStructured.summary}</p>
              </div>
            )}

            {/* Structured Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Referenced Dates */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <Calendar className="h-3.5 w-3.5 text-gov-navy" />
                  <span>Referenced Dates</span>
                </div>
                {rawStructured.referenced_dates && rawStructured.referenced_dates.length > 0 ? (
                  <div className="space-y-1.5">
                    {rawStructured.referenced_dates.map((d: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-600">{d.label || 'Date'}:</span>
                        <strong className="font-mono text-gov-navy">{d.date}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No dates extracted</span>
                )}
              </div>

              {/* Deadlines */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Statutory Deadlines</span>
                </div>
                {rawStructured.deadlines && rawStructured.deadlines.length > 0 ? (
                  <div className="space-y-1.5">
                    {rawStructured.deadlines.map((dl: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-600">{dl.label}:</span>
                        <strong className="font-mono text-red-600 font-bold">{dl.date}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No deadlines explicitly declared</span>
                )}
              </div>

              {/* Survey Numbers & Area */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <FileText className="h-3.5 w-3.5 text-gov-navy" />
                  <span>Survey Parcels &amp; Land Area</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-slate-500">Survey Numbers: </span>
                    {rawStructured.parcel_survey_numbers && rawStructured.parcel_survey_numbers.length > 0 ? (
                      <strong className="font-mono text-gov-navy">
                        {rawStructured.parcel_survey_numbers.join(', ')}
                      </strong>
                    ) : (
                      <span className="text-slate-400 italic">None mentioned</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500">Area Mentioned: </span>
                    <strong className="text-gov-slate">{rawStructured.area_mentioned || 'Unspecified'}</strong>
                  </div>
                </div>
              </div>

              {/* Monetary Values */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Monetary &amp; Compensation Figures</span>
                </div>
                {rawStructured.monetary_values && rawStructured.monetary_values.length > 0 ? (
                  <div className="space-y-1.5">
                    {rawStructured.monetary_values.map((m: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-600">{m.purpose || 'Amount'}:</span>
                        <strong className="font-mono text-emerald-700">
                          {m.currency || '₹'} {typeof m.amount === 'number' ? m.amount.toLocaleString('en-IN') : m.amount}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No financial figures extracted</span>
                )}
              </div>

              {/* Parties */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <Users className="h-3.5 w-3.5 text-gov-navy" />
                  <span>Parties &amp; Claimants</span>
                </div>
                {rawStructured.parties && rawStructured.parties.length > 0 ? (
                  <div className="space-y-1 text-[11px]">
                    {rawStructured.parties.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="font-medium text-gov-slate">{p.name}</span>
                        <span className="text-slate-400 text-[10px]">{p.role || 'Party'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No individual parties listed</span>
                )}
              </div>

              {/* Authorities */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-gov-slate border-b pb-1">
                  <Building className="h-3.5 w-3.5 text-gov-navy" />
                  <span>Competent Authorities &amp; Offices</span>
                </div>
                {rawStructured.authorities && rawStructured.authorities.length > 0 ? (
                  <div className="text-[11px] text-gov-slate space-y-1">
                    {rawStructured.authorities.map((a: string, idx: number) => (
                      <div key={idx} className="font-medium">• {a}</div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No authority named</span>
                )}
              </div>
            </div>

            {/* Missing or Uncertain Items */}
            {rawStructured.missing_or_uncertain_information &&
              rawStructured.missing_or_uncertain_information.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
                  <span className="font-bold text-amber-800 flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Missing or Ambiguous Information Noted by AI:
                  </span>
                  <ul className="list-disc list-inside text-amber-700 text-[11px] space-y-0.5">
                    {rawStructured.missing_or_uncertain_information.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Editing Form (if enabled) */}
            {isEditing && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3 text-xs">
                <div className="font-bold text-gov-navy flex items-center gap-1.5">
                  <Edit3 className="h-4 w-4" /> Human Verification &amp; Data Rectification
                </div>
                <p className="text-[11px] text-slate-600">
                  Update any field values below. The original raw AI extraction will remain preserved in the audit log.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gov-slate mb-1">
                      Survey Numbers (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={editedData.parcel_survey_numbers?.join(', ') || ''}
                      onChange={(e) =>
                        setEditedData({
                          ...editedData,
                          parcel_survey_numbers: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gov-slate mb-1">
                      Area Mentioned
                    </label>
                    <input
                      type="text"
                      value={editedData.area_mentioned || ''}
                      onChange={(e) => setEditedData({ ...editedData, area_mentioned: e.target.value })}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gov-slate mb-1">
                    Summary Rectification
                  </label>
                  <textarea
                    rows={2}
                    value={editedData.summary || ''}
                    onChange={(e) => setEditedData({ ...editedData, summary: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Human Verification Action Bar */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gov-slate mb-1">
                    Verifying Officer *
                  </label>
                  <input
                    type="text"
                    value={actorName}
                    readOnly
                    aria-readonly="true"
                    title="Taken from the signed-in profile; cannot be edited"
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Recorded in the verification audit entry as your signed-in identity.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gov-slate mb-1">
                    Validation Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                    placeholder="e.g. Verified against physical gazette copy dated 12/04/2026."
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                  Close
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleValidate('rejected')}
                    disabled={isSubmitting}
                    className="text-red-700 hover:bg-red-50 border-red-200"
                    leftIcon={<XCircle className="h-3.5 w-3.5" />}
                  >
                    Reject Extraction
                  </Button>

                  {isEditing ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleValidate('edited')}
                      disabled={isSubmitting}
                      leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    >
                      {isSubmitting ? 'Saving...' : 'Accept with Corrections'}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleValidate('accepted')}
                      disabled={isSubmitting}
                      leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                    >
                      {isSubmitting ? 'Verifying...' : 'Accept All Extracted Fields'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State when no extractions and not failed */}
        {!latestExtraction && document.status === 'uploaded' && (
          <div className="text-center py-8 text-xs text-slate-500 space-y-3">
            <Bot className="h-8 w-8 text-slate-400 mx-auto" />
            <p>
              This document is uploaded to storage. Trigger Gemini structured extraction to parse statutory dates, survey numbers, and deadlines.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleTriggerAI}
              disabled={isProcessing}
              leftIcon={<Sparkles className="h-3.5 w-3.5" />}
            >
              {isProcessing ? 'Extracting via Gemini...' : 'Start Gemini Extraction'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
