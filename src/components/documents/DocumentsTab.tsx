import React, { useState, useEffect, useMemo } from 'react';
import { fetchCaseDocuments } from '../../lib/api';
import { CaseDocument, CaseStageInstance } from '../../../shared/types';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DocumentReviewModal } from './DocumentReviewModal';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  Search,
  Filter,
  ShieldCheck,
  Eye,
  AlertCircle,
  FileWarning,
  Clock,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';

interface DocumentsTabProps {
  caseId: string;
  stageInstances?: CaseStageInstance[];
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({ caseId, stageInstances = [] }) => {
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDocForReview, setSelectedDocForReview] = useState<CaseDocument | null>(null);
  const [preselectedStageId, setPreselectedStageId] = useState<string | undefined>(undefined);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadDocs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchCaseDocuments(caseId);
      setDocuments(res.documents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load case documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [caseId]);

  // Compute Stage-by-Stage Statutory Checklist
  const stageChecklist = useMemo(() => {
    return stageInstances.map((inst) => {
      const stage = inst.stage;
      const requiredDocTypes = stage?.required_documents || [];

      // Find documents uploaded for this stage or matching document type
      const stageDocs = documents.filter((d) => {
        if (d.stage_instance_id === inst.id) return true;
        // Match by document_type name normalized
        return requiredDocTypes.some(
          (req) =>
            req.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            d.document_type.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
      });

      // Match each requirement
      const requirementStatus = requiredDocTypes.map((req) => {
        const matchingDoc = stageDocs.find(
          (d) =>
            d.document_type.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            req.toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        let state: 'missing' | 'uploaded' | 'processing' | 'extracted' | 'pending_verification' | 'verified' | 'rejected' =
          'missing';

        if (matchingDoc) {
          if (matchingDoc.status === 'verified') state = 'verified';
          else if (matchingDoc.status === 'rejected') state = 'rejected';
          else if (matchingDoc.status === 'processing') state = 'processing';
          else if (matchingDoc.status === 'validation_required') state = 'pending_verification';
          else if (matchingDoc.extractions && matchingDoc.extractions.length > 0) state = 'extracted';
          else state = 'uploaded';
        }

        return {
          requiredName: req,
          document: matchingDoc,
          state,
        };
      });

      const totalRequired = requiredDocTypes.length;
      const totalVerified = requirementStatus.filter((r) => r.state === 'verified').length;
      const totalMissing = requirementStatus.filter((r) => r.state === 'missing').length;

      return {
        stageInstance: inst,
        stageTitle: stage?.title || `Stage ${inst.stage_id}`,
        stageCode: stage?.code || '',
        stageStatus: inst.status,
        requiredRequirements: requirementStatus,
        totalRequired,
        totalVerified,
        totalMissing,
      };
    });
  }, [stageInstances, documents]);

  // Overall compliance metrics
  const totalStatutoryRequired = stageChecklist.reduce((acc, s) => acc + s.totalRequired, 0);
  const totalStatutoryVerified = stageChecklist.reduce((acc, s) => acc + s.totalVerified, 0);
  const totalStatutoryMissing = stageChecklist.reduce((acc, s) => acc + s.totalMissing, 0);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <Badge variant="emerald">VERIFIED</Badge>;
      case 'validation_required':
        return <Badge variant="amber">PENDING VERIFICATION</Badge>;
      case 'processing':
        return <Badge variant="navy">PROCESSING</Badge>;
      case 'failed':
        return <Badge variant="red">EXTRACTION FAILED</Badge>;
      case 'rejected':
        return <Badge variant="red">REJECTED</Badge>;
      default:
        return <Badge variant="navy">UPLOADED</Badge>;
    }
  };

  const getRequirementStateBadge = (state: string) => {
    switch (state) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
            <CheckCircle className="h-3 w-3" /> Verified
          </span>
        );
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
            <Clock className="h-3 w-3" /> Pending Verification
          </span>
        );
      case 'extracted':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
            <Sparkles className="h-3 w-3 text-blue-600" /> AI Extracted
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
            <RotateCw className="h-3 w-3 animate-spin" /> Processing
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
            <AlertCircle className="h-3 w-3" /> Rejected
          </span>
        );
      case 'missing':
      default:
        return (
          <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
            <FileWarning className="h-3 w-3 text-red-600" /> Missing Statutory Document
          </span>
        );
    }
  };

  const handleOpenUploadForStage = (stageInstId?: string) => {
    setPreselectedStageId(stageInstId);
    setIsUploadOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. STATUTORY COMPLIANCE SUMMARY RIBBON */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gov-navy" />
              <h3 className="font-bold text-gov-slate text-sm">
                Statutory Document Compliance Checklist
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Strictly verifies required statutory documents per RFCTLARR 2013 milestone prerequisites.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Statutory Status:</span>
              <strong className="text-gov-slate">
                {totalStatutoryVerified} of {totalStatutoryRequired} Verified
              </strong>
            </div>

            {totalStatutoryMissing > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-gov-red bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                <FileWarning className="h-3.5 w-3.5" />
                <span>{totalStatutoryMissing} Missing</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>All Required Present</span>
              </span>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleOpenUploadForStage(undefined)}
              leftIcon={<Upload className="h-3.5 w-3.5" />}
            >
              Upload Document
            </Button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. STAGE-BY-STAGE STATUTORY CHECKLIST (VISUALLY PROMINENT MISSING DOCS) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
          <span>Workflow Stage Prerequisites</span>
          <span className="text-[10px] text-slate-400 font-normal">
            Advancement is blocked if mandatory statutory documents are missing or rejected
          </span>
        </div>

        <div className="space-y-3">
          {stageChecklist.map((group) => {
            const hasMissing = group.totalMissing > 0;
            const isStageActive = group.stageStatus === 'in_progress';

            return (
              <div
                key={group.stageInstance.id}
                className={clsx(
                  'bg-white rounded-xl border p-4 shadow-xs transition-all',
                  isStageActive
                    ? 'border-blue-300 ring-1 ring-blue-100'
                    : hasMissing
                    ? 'border-slate-200'
                    : 'border-slate-200'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                      {group.stageCode}
                    </span>
                    <strong className="text-xs font-bold text-gov-slate">
                      {group.stageTitle}
                    </strong>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      • {group.stageStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      {group.totalVerified} / {group.totalRequired} Verified
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenUploadForStage(group.stageInstance.id)}
                      className="text-[11px] text-gov-navy font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="h-3 w-3" />
                      <span>Upload for Stage</span>
                    </button>
                  </div>
                </div>

                {/* Requirements list */}
                {group.requiredRequirements.length === 0 ? (
                  <div className="py-2 text-[11px] text-slate-400 italic">
                    No statutory document prerequisites explicitly required for this stage.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 mt-2">
                    {group.requiredRequirements.map((req, idx) => {
                      return (
                        <div
                          key={idx}
                          className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gov-slate">
                                  {req.requiredName}
                                </span>
                                {getRequirementStateBadge(req.state)}
                              </div>
                              {req.document && (
                                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                                  <span>File: {req.document.title}</span>
                                  <span>•</span>
                                  <span>
                                    Uploaded: {new Date(req.document.uploaded_at).toLocaleDateString('en-IN')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            {req.document ? (
                              <Button
                                size="sm"
                                variant={req.document.status === 'validation_required' ? 'primary' : 'outline'}
                                onClick={() => setSelectedDocForReview(req.document ?? null)}
                              >
                                {req.document.status === 'verified'
                                  ? 'View Details'
                                  : req.document.status === 'validation_required'
                                  ? 'Verify Document'
                                  : 'Review'}
                              </Button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenUploadForStage(group.stageInstance.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-gov-red bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <Upload className="h-3 w-3" />
                                <span>Upload Missing</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ALL UPLOADED DOCUMENTS VAULT (SEARCH, FILTER & AUDIT) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-gov-slate text-sm">
              All Repository Documents ({documents.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Complete vault of statutory notifications, gazette publications, compensation awards, and revenue extracts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search vault..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-gov-navy bg-slate-50"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none"
            >
              <option value="all">All Statuses ({documents.length})</option>
              <option value="verified">Verified</option>
              <option value="validation_required">Pending Verification</option>
              <option value="uploaded">Uploaded</option>
              <option value="failed">Failed</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={loadDocs}
              leftIcon={<RotateCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Documents List */}
        {filteredDocs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No documents matching the active filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDocs.map((doc) => {
              const extraction = doc.extractions && doc.extractions.length > 0 ? doc.extractions[0] : null;
              const confidence = extraction?.confidence_score
                ? Math.round(extraction.confidence_score * 100)
                : null;

              return (
                <div
                  key={doc.id}
                  className="py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-gov-navy shrink-0 mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-gov-slate text-xs font-semibold">
                          {doc.title}
                        </strong>
                        {getStatusBadge(doc.status)}
                        {confidence !== null && (
                          <span
                            className={clsx(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full',
                              confidence >= 80
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            )}
                          >
                            {confidence}% AI Confidence
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono uppercase text-gov-navy font-semibold text-[10px]">
                          {doc.document_type.replace(/_/g, ' ')}
                        </span>
                        <span>•</span>
                        <span>
                          {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}
                        </span>
                        <span>•</span>
                        <span>Uploaded: {new Date(doc.uploaded_at).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                    )}

                    <Button
                      variant={doc.status === 'validation_required' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDocForReview(doc)}
                      leftIcon={
                        doc.status === 'verified' ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        )
                      }
                    >
                      {doc.status === 'verified'
                        ? 'Review Details'
                        : doc.status === 'validation_required'
                        ? 'Validate Extracted Data'
                        : doc.status === 'failed'
                        ? 'Retry Extraction'
                        : 'Process & Review'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        caseId={caseId}
        stageInstances={stageInstances}
        preselectedStageId={preselectedStageId}
        onSuccess={() => {
          loadDocs();
        }}
      />

      {/* Review Modal */}
      <DocumentReviewModal
        isOpen={Boolean(selectedDocForReview)}
        onClose={() => setSelectedDocForReview(null)}
        document={selectedDocForReview}
        onRefresh={() => {
          loadDocs();
        }}
      />
    </div>
  );
};
