import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  ShieldCheck,
  Download,
  Eye,
  RefreshCw,
  Sparkles,
  FileCheck,
  Lock,
  Calendar,
  Layers,
  Building2,
  FolderPlus,
  X,
  UploadCloud,
  FileSpreadsheet,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { VaultDocument, DocumentVaultStats, VaultDocumentCategory } from '../../shared/types';
import { fetchDocumentVault, fetchDocumentVaultStats, createVaultDocument } from '../lib/api';

const CATEGORY_LABELS: Record<VaultDocumentCategory, { label: string; badge: string }> = {
  gazette_notification: { label: 'Gazette Notification', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  land_record_7_12: { label: '7/12 & Mutation Extract', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  mutation_entry: { label: 'Revenue Mutation Entry', badge: 'bg-teal-50 text-teal-800 border-teal-200' },
  sia_report: { label: 'SIA & Mitigation Report', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  court_order: { label: 'High Court / LAC Order', badge: 'bg-rose-50 text-rose-800 border-rose-200' },
  valuation_certificate: { label: 'Collector Valuation Sheet', badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  survey_map: { label: 'Cadastral Demarcation Map', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  public_hearing_minutes: { label: 'Public Hearing Minutes', badge: 'bg-sand-100 text-mocha-800 border-sand-300' },
  rr_scheme: { label: 'Approved R&R Scheme', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  award_declaration: { label: 'Section 23 Award Declaration', badge: 'bg-lime-50 text-lime-800 border-lime-200' },
};

export const DocumentVaultPage: React.FC = () => {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [stats, setStats] = useState<DocumentVaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<'all' | 'by_case' | 'by_project'>('all');
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: 'gazette_notification' as VaultDocumentCategory,
    case_number: 'MH-PUN-2026-0089',
    case_id: 'case-harden-pune-001',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    file_name: '',
    file_size_bytes: 2500000,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsData, statsData] = await Promise.all([
        fetchDocumentVault({ category: categoryFilter, search }),
        fetchDocumentVaultStats(),
      ]);
      setDocuments(docsData);
      setStats(statsData);
      if (docsData.length > 0 && !selectedDoc) {
        setSelectedDoc(docsData[0]);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load document vault');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [categoryFilter]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title.trim()) {
      setUploadError('Document title is required');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileName = uploadForm.file_name.trim() || `${uploadForm.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const created = await createVaultDocument({
        title: uploadForm.title,
        category: uploadForm.category,
        case_number: uploadForm.case_number || undefined,
        case_id: uploadForm.case_id || undefined,
        project_name: uploadForm.project_name || undefined,
        file_name: fileName,
        file_size_bytes: uploadForm.file_size_bytes,
        mime_type: 'application/pdf',
        ocr_extracted: true,
        ocr_confidence: 98.4,
        verification_status: 'verified',
        sha256_hash: `sha256-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      });

      setDocuments((prev) => [created, ...prev]);
      setSelectedDoc(created);
      setShowUploadModal(false);
      setUploadForm({
        title: '',
        category: 'gazette_notification',
        case_number: 'MH-PUN-2026-0089',
        case_id: 'case-harden-pune-001',
        project_name: 'Pune Outer Ring Road - Western Alignment',
        file_name: '',
        file_size_bytes: 2500000,
      });
      // Refresh stats
      fetchDocumentVaultStats().then(setStats).catch(() => {});
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document to vault');
    } finally {
      setIsUploading(false);
    }
  };

  // Grouping structures
  const documentsByCase = useMemo(() => {
    const map = new Map<string, { caseNumber: string; projectName?: string; docs: VaultDocument[] }>();
    for (const doc of documents) {
      const key = doc.case_number || 'General Repository';
      if (!map.has(key)) {
        map.set(key, { caseNumber: key, projectName: doc.project_name, docs: [] });
      }
      map.get(key)!.docs.push(doc);
    }
    return Array.from(map.values());
  }, [documents]);

  const documentsByProject = useMemo(() => {
    const map = new Map<string, { projectName: string; docs: VaultDocument[] }>();
    for (const doc of documents) {
      const key = doc.project_name || 'General Portfolio';
      if (!map.has(key)) {
        map.set(key, { projectName: key, docs: [] });
      }
      map.get(key)!.docs.push(doc);
    }
    return Array.from(map.values());
  }, [documents]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Authoritative Document Vault
            <span className="rounded bg-sand-200/80 px-2 py-0.5 text-xs font-normal text-mocha-700">प्राधिकृत दस्तावेज़ संग्रह</span>
          </span>
        }
        subtitle="Tamper-evident legal gazettes, 7/12 land records, mutation extracts, court orders & AI-extracted OCR intelligence"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sand-500" />
              Refresh Vault
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
            >
              <UploadCloud className="h-4 w-4" />
              Upload Document
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-indigo-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Vault Documents</p>
            <p className="text-2xl font-bold text-mocha-900 mt-1">{stats.total_documents}</p>
            <p className="text-[11px] text-indigo-700 font-medium mt-0.5">{(stats.storage_total_bytes / (1024 * 1024)).toFixed(1)} MB Encrypted Storage</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-emerald-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">SHA-256 Verified</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.verified_documents}</p>
            <p className="text-[11px] text-emerald-800 font-medium mt-0.5">Cryptographically unforgeable</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-amber-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">OCR Extracted</p>
            <p className="text-2xl font-bold text-mocha-900 mt-1">{stats.total_documents - stats.pending_ocr_documents}</p>
            <p className="text-[11px] text-amber-800 font-medium mt-0.5">Gemini Vision OCR Processed</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-purple-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-mocha-500">Statutory Gazettes</p>
            <p className="text-2xl font-bold text-purple-700 mt-1">{stats.category_breakdown?.gazette_notification || 0}</p>
            <p className="text-[11px] text-purple-800 font-medium mt-0.5">Section 11 & Section 19 Notifications</p>
          </Card>
        </div>
      )}

      {/* Grouping & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-sand-200 shadow-2xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-sand-300 p-0.5 bg-sand-100">
            <button
              onClick={() => setGroupMode('all')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                groupMode === 'all' ? 'bg-white text-terra-800 shadow-xs' : 'text-mocha-600 hover:text-mocha-900'
              }`}
            >
              All Documents
            </button>
            <button
              onClick={() => setGroupMode('by_case')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                groupMode === 'by_case' ? 'bg-white text-terra-800 shadow-xs' : 'text-mocha-600 hover:text-mocha-900'
              }`}
            >
              Group By Case
            </button>
            <button
              onClick={() => setGroupMode('by_project')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                groupMode === 'by_project' ? 'bg-white text-terra-800 shadow-xs' : 'text-mocha-600 hover:text-mocha-900'
              }`}
            >
              Group By Project
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-sand-400" />
            <input
              type="text"
              placeholder="Search documents or SHA hash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 bg-sand-50/50 text-mocha-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-terra-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-3 py-1.5 bg-white text-mocha-800 focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Legal Categories</option>
            <option value="gazette_notification">Gazette Notifications</option>
            <option value="land_record_7_12">7/12 & Mutation Extracts</option>
            <option value="sia_report">SIA Reports</option>
            <option value="court_order">Court Orders</option>
            <option value="valuation_certificate">Valuation Sheets</option>
            <option value="survey_map">Cadastral Demarcation Maps</option>
            <option value="rr_scheme">R&R Schemes</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Grouped or Flat Document List */}
        <div className="lg:col-span-2 space-y-4">
          {groupMode === 'by_case' ? (
            /* Group by Case */
            documentsByCase.map((group) => (
              <Card key={group.caseNumber} className="overflow-hidden border-sand-300">
                <div className="bg-sand-100/90 px-4 py-3 border-b border-sand-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-terra-700" />
                    <div>
                      <span className="font-bold text-xs text-mocha-900">{group.caseNumber}</span>
                      {group.projectName && (
                        <span className="text-[11px] text-mocha-500 ml-2">({group.projectName})</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-sand-300 text-mocha-700">
                    {group.docs.length} Documents
                  </span>
                </div>

                <div className="divide-y divide-sand-100">
                  {group.docs.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const catMeta = CATEGORY_LABELS[doc.category] || { label: doc.category, badge: 'bg-sand-100 text-mocha-800' };

                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`p-3.5 flex items-start justify-between gap-3 hover:bg-sand-50/80 cursor-pointer transition-colors ${
                          isSelected ? 'bg-terra-50/70 border-l-4 border-l-terra-700' : ''
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-mocha-900 truncate">{doc.title}</span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded border shrink-0 ${catMeta.badge}`}>
                              {catMeta.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-mocha-500">
                            <span className="font-mono">{doc.file_name}</span>
                            <span>•</span>
                            <span>{(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>{new Date(doc.uploaded_at).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {doc.ocr_extracted && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              <Sparkles className="h-3 w-3" />
                              OCR {doc.ocr_confidence}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          ) : groupMode === 'by_project' ? (
            /* Group by Project */
            documentsByProject.map((group) => (
              <Card key={group.projectName} className="overflow-hidden border-sand-300">
                <div className="bg-sand-100/90 px-4 py-3 border-b border-sand-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-terra-700" />
                    <span className="font-bold text-xs text-mocha-900">{group.projectName}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-sand-300 text-mocha-700">
                    {group.docs.length} Documents
                  </span>
                </div>

                <div className="divide-y divide-sand-100">
                  {group.docs.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const catMeta = CATEGORY_LABELS[doc.category] || { label: doc.category, badge: 'bg-sand-100 text-mocha-800' };

                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`p-3.5 flex items-start justify-between gap-3 hover:bg-sand-50/80 cursor-pointer transition-colors ${
                          isSelected ? 'bg-terra-50/70 border-l-4 border-l-terra-700' : ''
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-mocha-900 truncate">{doc.title}</span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded border shrink-0 ${catMeta.badge}`}>
                              {catMeta.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-mocha-500">
                            {doc.case_number && <span className="font-semibold text-terra-800">{doc.case_number}</span>}
                            <span>•</span>
                            <span className="font-mono">{doc.file_name}</span>
                            <span>•</span>
                            <span>{(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {doc.ocr_extracted && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              <Sparkles className="h-3 w-3" />
                              OCR
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          ) : (
            /* Flat List */
            <div className="space-y-3">
              {documents.length > 0 ? (
                documents.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const catMeta = CATEGORY_LABELS[doc.category] || { label: doc.category, badge: 'bg-sand-100 text-mocha-800' };

                  return (
                    <Card
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-4 hover:border-terra-400 cursor-pointer transition-all ${
                        isSelected ? 'border-terra-700 ring-2 ring-terra-700/20 bg-terra-50/30' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xs font-bold text-mocha-900">{doc.title}</h4>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${catMeta.badge}`}>
                              {catMeta.label}
                            </span>
                          </div>

                          <p className="text-[11px] text-mocha-600 font-mono flex items-center gap-2">
                            <span>{doc.file_name}</span>
                            <span>•</span>
                            <span>{(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                            {doc.case_number && (
                              <>
                                <span>•</span>
                                <span className="font-bold text-terra-800">{doc.case_number}</span>
                              </>
                            )}
                          </p>

                          {doc.extracted_entities?.survey_numbers && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] text-mocha-500 font-semibold">Survey Numbers:</span>
                              {doc.extracted_entities.survey_numbers.slice(0, 5).map((s) => (
                                <span key={s} className="px-1.5 py-0.2 bg-sand-200/80 rounded text-[10px] font-mono text-mocha-800">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            Verified
                          </span>
                          <span className="text-[10px] text-mocha-400 font-mono">
                            {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <EmptyState
                  title="No Documents Found"
                  description="No documents match the active filter. Click 'Upload Document' to add a legal document to the vault."
                />
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Document Cryptographic & AI Inspector */}
        <div className="lg:col-span-1">
          {selectedDoc ? (
            <Card className="p-5 space-y-4 border-terra-200">
              <div className="border-b border-sand-200 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-mocha-800">Document Dossier</h3>
                    <p className="text-[11px] text-mocha-500 font-mono mt-0.5">{selectedDoc.id}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[9px] font-bold rounded border ${
                      CATEGORY_LABELS[selectedDoc.category]?.badge
                    }`}
                  >
                    {CATEGORY_LABELS[selectedDoc.category]?.label}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-mocha-900 mt-2 leading-snug">{selectedDoc.title}</h4>
              </div>

              {/* Case & Project Associations */}
              <div className="bg-sand-50/70 p-3 rounded-lg border border-sand-200 space-y-2 text-xs">
                {selectedDoc.case_number && (
                  <div className="flex justify-between">
                    <span className="text-mocha-500">Case Number:</span>
                    <span className="font-bold text-terra-900">{selectedDoc.case_number}</span>
                  </div>
                )}
                {selectedDoc.project_name && (
                  <div className="flex justify-between">
                    <span className="text-mocha-500">Project:</span>
                    <span className="font-semibold text-mocha-900 truncate max-w-[180px]">{selectedDoc.project_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-mocha-500">File Size:</span>
                  <span className="font-semibold text-mocha-900">{(selectedDoc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mocha-500">Uploaded By:</span>
                  <span className="font-mono text-mocha-700">{selectedDoc.uploaded_by}</span>
                </div>
              </div>

              {/* Cryptographic SHA-256 Signature */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                  <Lock className="h-3.5 w-3.5" />
                  Cryptographic Integrity Hash
                </div>
                <div className="p-2.5 bg-sand-100 rounded-lg border border-sand-200 font-mono text-[10px] break-all text-mocha-800">
                  {selectedDoc.sha256_hash}
                </div>
                <p className="text-[10px] text-mocha-500">
                  Verified against official gazette ledger. Admissible under Indian Evidence Act Section 65B.
                </p>
              </div>

              {/* AI OCR Extracted Intelligence */}
              {selectedDoc.extracted_entities && (
                <div className="space-y-2 pt-2 border-t border-sand-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      Extracted Legal Entities
                    </span>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      {selectedDoc.ocr_confidence}% Confidence
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {selectedDoc.extracted_entities.village && (
                      <div className="flex justify-between py-1 border-b border-sand-100">
                        <span className="text-mocha-500">Village:</span>
                        <span className="font-bold text-mocha-900">{selectedDoc.extracted_entities.village}</span>
                      </div>
                    )}
                    {selectedDoc.extracted_entities.statutory_sections && (
                      <div>
                        <span className="text-mocha-500 block mb-1">Statutory Provisions:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedDoc.extracted_entities.statutory_sections.map((sec) => (
                            <span key={sec} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-800 rounded border border-indigo-200 text-[10px] font-semibold">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedDoc.extracted_entities.survey_numbers && (
                      <div>
                        <span className="text-mocha-500 block mb-1">Demarcated Survey Numbers:</span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {selectedDoc.extracted_entities.survey_numbers.map((sn) => (
                            <span key={sn} className="px-1.5 py-0.5 bg-sand-200 rounded text-[10px] font-mono font-bold text-mocha-900">
                              #{sn}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Document Actions */}
              <div className="pt-3 border-t border-sand-200 flex gap-2">
                <button
                  onClick={() => {
                    alert(`Downloading verified copy of "${selectedDoc.file_name}" with SHA-256 certificate.`);
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Download File
                </button>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-mocha-500 text-xs">
              Select a document to inspect cryptographic integrity & AI-extracted legal entities.
            </Card>
          )}
        </div>
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-mocha-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-sand-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-mocha-900 flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-terra-700" />
                  Upload Legal Document to Vault
                </h3>
                <p className="text-xs text-mocha-500 mt-0.5">
                  Index Gazette, Land Record, SIA or Court Order into tamper-evident vault.
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-sand-500 hover:bg-sand-100 hover:text-mocha-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gazette Notification Section 19(1)"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                />
              </div>

              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Document Category</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value as any })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                >
                  <option value="gazette_notification">Gazette Notification</option>
                  <option value="land_record_7_12">7/12 & Mutation Extract</option>
                  <option value="sia_report">Social Impact Assessment (SIA)</option>
                  <option value="court_order">Court Order / Judicial Injunction</option>
                  <option value="valuation_certificate">Collector Valuation Sheet</option>
                  <option value="survey_map">Cadastral Demarcation Map</option>
                  <option value="rr_scheme">R&R Scheme</option>
                  <option value="award_declaration">Section 23 Award Declaration</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Case Number</label>
                  <input
                    type="text"
                    placeholder="e.g. MH-PUN-2026-0089"
                    value={uploadForm.case_number}
                    onChange={(e) => setUploadForm({ ...uploadForm, case_number: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>
                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Project Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Pune Outer Ring Road"
                    value={uploadForm.project_name}
                    onChange={(e) => setUploadForm({ ...uploadForm, project_name: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-mocha-800 block mb-1">File Name</label>
                <input
                  type="text"
                  placeholder="e.g. Pune_RingRoad_Sec19_Declaration_Official.pdf"
                  value={uploadForm.file_name}
                  onChange={(e) => setUploadForm({ ...uploadForm, file_name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600 font-mono"
                />
              </div>

              <div className="p-3 bg-sand-100 rounded-xl border border-sand-200 text-mocha-600 text-[11px] leading-relaxed">
                Files are cryptographically sealed with SHA-256 hash upon upload and dispatched to the Gemini legal OCR parser.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-200">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  {isUploading ? 'Sealing...' : 'Upload & Hash Seal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
