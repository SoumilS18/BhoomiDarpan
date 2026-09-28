import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { VaultDocument, DocumentVaultStats, VaultDocumentCategory } from '../../shared/types';
import { fetchDocumentVault, fetchDocumentVaultStats } from '../lib/api';

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
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);

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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-sand-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, filename, SHA-256 hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 focus:outline-none focus:ring-2 focus:ring-terra-600 text-mocha-900 bg-sand-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-mocha-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Document Categories</option>
            <option value="gazette_notification">Gazette Notifications</option>
            <option value="land_record_7_12">7/12 Land Records</option>
            <option value="sia_report">SIA Reports</option>
            <option value="court_order">Court Orders</option>
            <option value="rr_scheme">R&R Schemes</option>
          </select>
        </div>
      </div>

      {/* Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document List Table */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-sand-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-sand-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mocha-800">
              Statutory Vault Index ({documents.length})
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-mocha-500 text-xs">Loading vault registry...</div>
          ) : documents.length === 0 ? (
            <EmptyState
              title="No Documents Found"
              description="No documents match your filter criteria."
            />
          ) : (
            <div className="divide-y divide-sand-200/70">
              {documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                const cat = CATEGORY_LABELS[doc.category] || { label: doc.category, badge: 'bg-sand-100 text-mocha-800' };

                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-terra-50/70' : 'hover:bg-sand-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cat.badge}`}>
                          {cat.label}
                        </span>
                        <h4 className="text-xs font-bold text-mocha-900 leading-snug">{doc.title}</h4>
                        <p className="text-[11px] text-mocha-500 font-mono">
                          {doc.file_name} • {(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                        <p className="text-[10px] text-mocha-400 mt-1">
                          {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Document Details */}
        <div className="lg:col-span-5">
          {selectedDoc ? (
            <Card className="p-5 space-y-5">
              <div className="border-b border-sand-200 pb-3">
                <span className="text-[10px] font-bold font-mono text-sand-500 uppercase">{selectedDoc.id}</span>
                <h3 className="text-sm font-bold text-mocha-900 mt-0.5">{selectedDoc.title}</h3>
                <p className="text-xs text-mocha-600 mt-0.5">Case: {selectedDoc.case_number}</p>
              </div>

              {/* Cryptographic Hash Verification */}
              <div className="bg-sand-50/80 p-3 rounded-lg border border-sand-200 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  SHA-256 Digital Fingerprint
                </div>
                <p className="font-mono text-[10px] text-mocha-700 break-all bg-white p-2 rounded border border-sand-200">
                  {selectedDoc.sha256_hash}
                </p>
                <p className="text-[10px] text-mocha-500">
                  Uploaded by: <span className="font-medium text-mocha-700">{selectedDoc.uploaded_by}</span>
                </p>
              </div>

              {/* Extracted Entities */}
              {selectedDoc.extracted_entities && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-mocha-700">
                      AI OCR Extracted Entities
                    </h4>
                    {selectedDoc.ocr_confidence && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {selectedDoc.ocr_confidence}% Confidence
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {selectedDoc.extracted_entities.village && (
                      <div className="flex justify-between py-1 border-b border-sand-100">
                        <span className="text-mocha-500">Village / Tehsil:</span>
                        <span className="font-semibold text-mocha-900">{selectedDoc.extracted_entities.village}</span>
                      </div>
                    )}
                    {selectedDoc.extracted_entities.survey_numbers && (
                      <div className="flex justify-between py-1 border-b border-sand-100">
                        <span className="text-mocha-500">Survey Parcels:</span>
                        <span className="font-semibold text-terra-800">
                          {selectedDoc.extracted_entities.survey_numbers.join(', ')}
                        </span>
                      </div>
                    )}
                    {selectedDoc.extracted_entities.statutory_sections && (
                      <div className="flex justify-between py-1 border-b border-sand-100">
                        <span className="text-mocha-500">Statutory Sections:</span>
                        <span className="font-semibold text-mocha-900">
                          {selectedDoc.extracted_entities.statutory_sections.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-8 text-center text-mocha-500 text-xs">
              Select a document from the index to inspect metadata and cryptographic signatures.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
