import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { uploadCaseDocument } from '../../lib/api';
import { DocumentType, CaseStageInstance } from '../../../shared/types';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stageInstances?: CaseStageInstance[];
  preselectedStageId?: string;
  onSuccess: (newDoc: any) => void;
}

const DOCUMENT_TYPES: Array<{ value: DocumentType; label: string }> = [
  { value: 'preliminary_notice', label: 'Preliminary Gazette Notice' },
  { value: 'sec_11_notification', label: 'Section 11 Preliminary Notification' },
  { value: 'hearing_minutes', label: 'Section 15 Hearing Minutes & Objections' },
  { value: 'survey_report', label: 'Cadastral Land Survey & Census Report' },
  { value: 'valuation_record', label: 'Land & Asset Valuation Statement' },
  { value: 'sec_19_declaration', label: 'Section 19 Declaration of Acquisition' },
  { value: 'award_order', label: 'Section 23 / 31 Award & Compensation Order' },
  { value: 'possession_memo', label: 'Section 38 Possession Certificate / Panchnama' },
  { value: 'litigation_filing', label: 'Court Stay / Legal Objection Petition' },
  { value: 'miscellaneous', label: 'Miscellaneous Statutory Record' },
];

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  caseId,
  stageInstances = [],
  preselectedStageId,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('sec_11_notification');
  const [stageInstanceId, setStageInstanceId] = useState(preselectedStageId || '');
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [actorName, setActorName] = useState('Land Acquisition Officer');

  React.useEffect(() => {
    if (preselectedStageId) {
      setStageInstanceId(preselectedStageId);
    }
  }, [preselectedStageId, isOpen]);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 25 * 1024 * 1024) {
        setError('File size exceeds the 25 MB statutory limit.');
        return;
      }
      setFile(selected);
      setError(null);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }
    if (!file && !textContent.trim()) {
      setError('Please select a file to upload or enter text content.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('document_type', documentType);
    if (stageInstanceId) formData.append('stage_instance_id', stageInstanceId);
    if (actorName) formData.append('actorName', actorName);

    if (file) {
      formData.append('file', file);
    } else if (textContent.trim()) {
      const textBlob = new Blob([textContent], { type: 'text/plain' });
      formData.append('file', textBlob, `${title.replace(/\s+/g, '_')}.txt`);
    }

    try {
      const res = await uploadCaseDocument(caseId, formData);
      setSuccessMsg('Document uploaded and statutory metadata recorded successfully.');
      setTimeout(() => {
        setIsUploading(false);
        onSuccess(res.document);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to upload document.');
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Statutory Case Document"
      subtitle="Safely store original notification, minutes, or legal order into registry"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <div>{successMsg}</div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Document Title *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Gazette Notification No. 441 - Section 11(1)"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Document Classification *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-gov-navy focus:outline-none"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Associated Workflow Stage
            </label>
            <select
              value={stageInstanceId}
              onChange={(e) => setStageInstanceId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-gov-navy focus:outline-none"
            >
              <option value="">General (All Stages)</option>
              {stageInstances.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage?.title || `Stage ${s.stage_id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Document File (PDF, Image, Scanned Order - Max 25MB)
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
            onChange={handleFileChange}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-gov-navy hover:file:bg-blue-100 cursor-pointer"
          />
          {file && (
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-gov-navy" />
              <span>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gov-slate">
              Or Direct Text / Gazette Notice Content
            </label>
            <span className="text-[10px] text-slate-400">Optional</span>
          </div>
          <textarea
            rows={4}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste raw notice text or Gazette order transcript here if available..."
            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:outline-none font-mono bg-slate-50"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Officer Name
            </label>
            <input
              type="text"
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200"
            />
          </div>

          <div className="flex items-end justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isUploading}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
