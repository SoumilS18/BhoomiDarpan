import React, { useState, useEffect } from 'react';
import {
  FileText,
  FileBarChart,
  Download,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { StatutoryReportMeta, GeneratedStatutoryReport, StatutoryReportId } from '../../shared/types';
import { fetchStatutoryReportCatalogue, generateStatutoryReport } from '../lib/api';

export const StatutoryReportsPage: React.FC = () => {
  const [catalogue, setCatalogue] = useState<StatutoryReportMeta[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<StatutoryReportId>('form_1_sia');
  const [reportData, setReportData] = useState<GeneratedStatutoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    fetchStatutoryReportCatalogue()
      .then((cat) => {
        setCatalogue(cat);
        if (cat.length > 0) {
          loadReport(cat[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const loadReport = async (id: StatutoryReportId) => {
    setSelectedReportId(id);
    setGenerating(true);
    try {
      const rep = await generateStatutoryReport(id);
      setReportData(rep);
    } catch (err: any) {
      alert(err.message || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCsv = () => {
    if (!reportData) return;
    const headers = reportData.columns.map((c) => c.label).join(',');
    const rows = reportData.rows
      .map((r) =>
        reportData.columns
          .map((c) => {
            const val = r[c.key] ?? '';
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportData.meta.code}_${Date.now()}.csv`;
    a.click();
  };

  const filteredCatalogue = catalogue.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.actSection.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            MIS Statutory Reports
            <span className="rounded bg-sand-200/80 px-2 py-0.5 text-xs font-normal text-mocha-700">सांविधिक प्रबंधन सूचना प्रतिवेदन</span>
          </span>
        }
        subtitle="Authoritative statutory templates, Form I to Form IV notifications, Section 30 Solatium computations & CAG compliance statements under RFCTLARR 2013"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadReport(selectedReportId)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sand-500" />
              Regenerate
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!reportData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        }
      />

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side Catalogue List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-sand-200 shadow-2xs space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search statutory forms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 focus:outline-none focus:ring-2 focus:ring-terra-600 text-mocha-900 bg-sand-50/50"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
            >
              <option value="all">All Report Categories</option>
              <option value="statutory">Statutory Declarations</option>
              <option value="valuation">Valuation & Solatium</option>
              <option value="rehabilitation">Rehabilitation & Resettlement</option>
              <option value="compliance">CAG / Compliance</option>
              <option value="spatial">Spatial Cadastre</option>
            </select>
          </div>

          <div className="space-y-2">
            {filteredCatalogue.map((item) => {
              const isSelected = selectedReportId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => loadReport(item.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-terra-50/90 border-terra-600 shadow-xs ring-1 ring-terra-600/30'
                      : 'bg-white border-sand-200 hover:border-sand-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold font-mono text-terra-700">{item.code}</span>
                    <span className="text-[9px] font-semibold text-sand-500 uppercase">{item.frequency}</span>
                  </div>
                  <h4 className="text-xs font-bold text-mocha-900 mt-1">{item.title}</h4>
                  <p className="text-[11px] text-mocha-500 font-hindi mt-0.5">{item.hindiTitle}</p>
                  <div className="mt-2 text-[10px] font-medium text-mocha-600 bg-sand-100/60 px-2 py-0.5 rounded inline-block">
                    {item.actSection}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side Generated Report Viewer */}
        <div className="lg:col-span-8">
          {generating ? (
            <Card className="p-12 text-center text-xs text-mocha-500">
              Generating statutory MIS computation from live case registries...
            </Card>
          ) : reportData ? (
            <Card className="p-6 space-y-6">
              {/* Report Header */}
              <div className="border-b border-sand-200 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-terra-700">{reportData.meta.code}</span>
                  <span className="text-[11px] text-mocha-500">
                    Generated: {new Date(reportData.generated_at).toLocaleDateString('en-IN')}
                  </span>
                </div>
                <h2 className="text-base font-bold text-mocha-900 mt-1">{reportData.meta.title}</h2>
                <p className="text-xs text-mocha-600 mt-0.5">{reportData.meta.description}</p>
                <div className="mt-2 text-xs font-semibold text-terra-800 bg-sand-50 px-2.5 py-1 rounded-lg inline-block border border-sand-200">
                  Authority: {reportData.meta.actSection}
                </div>
              </div>

              {/* Summary Numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-sand-50/70 rounded-lg border border-sand-200 text-center">
                  <p className="text-[10px] text-mocha-500 uppercase font-bold">Records</p>
                  <p className="text-lg font-bold text-mocha-900 mt-0.5">{reportData.summary.total_records}</p>
                </div>
                {reportData.summary.total_area_hectares && (
                  <div className="p-3 bg-sand-50/70 rounded-lg border border-sand-200 text-center">
                    <p className="text-[10px] text-mocha-500 uppercase font-bold">Total Land</p>
                    <p className="text-lg font-bold text-mocha-900 mt-0.5">
                      {reportData.summary.total_area_hectares.toFixed(2)} Ha
                    </p>
                  </div>
                )}
                {reportData.summary.total_financial_commitment_inr && (
                  <div className="p-3 bg-sand-50/70 rounded-lg border border-sand-200 text-center">
                    <p className="text-[10px] text-mocha-500 uppercase font-bold">Total Award</p>
                    <p className="text-lg font-bold text-mocha-900 mt-0.5">
                      ₹{(reportData.summary.total_financial_commitment_inr / 10000000).toFixed(2)} Cr
                    </p>
                  </div>
                )}
                <div className="p-3 bg-sand-50/70 rounded-lg border border-sand-200 text-center">
                  <p className="text-[10px] text-mocha-500 uppercase font-bold">Compliance</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">
                    {reportData.summary.compliance_score_pct}%
                  </p>
                </div>
              </div>

              {/* Dynamic Table */}
              <div className="overflow-x-auto rounded-lg border border-sand-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sand-50/90 text-mocha-700 font-semibold uppercase text-[10px] tracking-wider border-b border-sand-200">
                    <tr>
                      {reportData.columns.map((col) => (
                        <th key={col.key} className="py-2.5 px-3 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-200/70 bg-white">
                    {reportData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-sand-50/50">
                        {reportData.columns.map((col) => {
                          const val = row[col.key];
                          if (col.type === 'currency' && typeof val === 'number') {
                            return (
                              <td key={col.key} className="py-2.5 px-3 font-semibold text-mocha-900 whitespace-nowrap">
                                ₹{(val / 100000).toFixed(2)} L
                              </td>
                            );
                          }
                          if (col.type === 'badge') {
                            return (
                              <td key={col.key} className="py-2.5 px-3 whitespace-nowrap">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {val}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={col.key} className="py-2.5 px-3 text-mocha-800 whitespace-nowrap">
                              {val ?? '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Statutory Notes */}
              <div className="p-3 bg-sand-50/70 rounded-lg border border-sand-200 space-y-1 text-[11px] text-mocha-600">
                <span className="font-bold text-mocha-800 uppercase tracking-wider text-[10px] block">
                  Statutory Notes & Legal Basis:
                </span>
                {reportData.statutory_notes.map((note, i) => (
                  <p key={i}>• {note}</p>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};
