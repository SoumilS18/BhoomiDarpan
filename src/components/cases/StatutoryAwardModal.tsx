import React, { useState, useEffect } from 'react';
import {
  StatutoryAwardCalculation,
  Parcel,
} from '../../../shared/types';
import { calculateParcelAward, disburseParcelDBT } from '../../lib/api';
import { Button } from '../common/Button';
import {
  X,
  IndianRupee,
  Sparkles,
  Printer,
  CheckCircle2,
  AlertCircle,
  Building2,
  TreePine,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileText,
  Sliders,
  RefreshCw,
  Send,
} from 'lucide-react';

interface StatutoryAwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  parcel: Parcel;
  onAwardUpdated?: (award: StatutoryAwardCalculation) => void;
}

export const StatutoryAwardModal: React.FC<StatutoryAwardModalProps> = ({
  isOpen,
  onClose,
  caseId,
  parcel,
  onAwardUpdated,
}) => {
  const [award, setAward] = useState<StatutoryAwardCalculation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDisbursing, setIsDisbursing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Parameter states for interactive simulation
  const [circleRate, setCircleRate] = useState<number>(1200000);
  const [distanceKm, setDistanceKm] = useState<number>(15);
  const [treesCount, setTreesCount] = useState<number>(4);
  const [treesValue, setTreesValue] = useState<number>(25000);
  const [structuresValue, setStructuresValue] = useState<number>(50000);
  const [tubewellValue, setTubewellValue] = useState<number>(35000);
  const [accrualDays, setAccrualDays] = useState<number>(180);
  const [showDecreePreview, setShowDecreePreview] = useState(false);

  useEffect(() => {
    if (isOpen && parcel) {
      loadInitialAward();
    }
  }, [isOpen, parcel?.id]);

  const loadInitialAward = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await calculateParcelAward(caseId, parcel.id, {});
      setAward(res);
      setCircleRate(res.circle_rate_per_acre);
      setTreesCount(res.assets_valuation.trees_count);
      setTreesValue(res.assets_valuation.trees_value);
      setStructuresValue(res.assets_valuation.structures_value);
      setTubewellValue(res.assets_valuation.tubewell_value);
      setAccrualDays(res.interest_accrual_days);
    } catch (err: any) {
      setError(err.message || 'Failed to load statutory award.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setIsCalculating(true);
    setError(null);
    try {
      const res = await calculateParcelAward(caseId, parcel.id, {
        circleRatePerAcre: circleRate,
        distanceFromUrbanKm: distanceKm,
        interestAccrualDays: accrualDays,
        assets: {
          trees_count: treesCount,
          trees_value: treesValue,
          structures_value: structuresValue,
          tubewell_value: tubewellValue,
        },
      });
      setAward(res);
      if (onAwardUpdated) onAwardUpdated(res);
      setSuccessMsg('Statutory Award successfully recalculated and updated in accordance with RFCTLARR First Schedule.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Recalculation failed.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDisburseDBT = async () => {
    setIsDisbursing(true);
    setError(null);
    try {
      const res = await disburseParcelDBT(caseId, parcel.id, {
        notes: `Compensation disbursed to ${parcel.landowner_names.join(', ')} under RFCTLARR Section 30 decree.`,
      });
      setAward(res);
      if (onAwardUpdated) onAwardUpdated(res);
      setSuccessMsg(`DBT Payout Transferred Successfully via PFMS (UTR: ${res.dbt_disbursement.utr_number}).`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'DBT disbursement failed.');
    } finally {
      setIsDisbursing(false);
    }
  };

  const handlePrintDecree = () => {
    if (!award) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Form-11 Statutory Award Decree - Survey ${award.survey_number}</title>
          <style>
            body { font-family: 'Times New Roman', serif; padding: 40px; color: #111; line-height: 1.5; font-size: 14px; }
            h2, h3 { text-align: center; margin: 5px 0; text-transform: uppercase; }
            .header-emblem { text-align: center; font-size: 11px; letter-spacing: 2px; color: #555; margin-bottom: 20px; }
            .decree-box { border: 2px solid #222; padding: 25px; margin-top: 20px; }
            pre { white-space: pre-wrap; font-family: monospace; font-size: 12px; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header-emblem">सत्यमेव जयते<br>GOVERNMENT OF INDIA / STATE REVENUE DEPARTMENT</div>
          <h2>Form-11: Statutory Award Decree</h2>
          <h3>Under Section 23, 27, 30 of RFCTLARR Act, 2013</h3>
          <div class="decree-box">
            <pre>${award.form_11_gazette_decree}</pre>
          </div>
          <div class="footer">
            <div>Seal of Competent Authority</div>
            <div>Signature of Land Acquisition Officer (LAO)</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 overflow-hidden animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Pinned Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-200/60 rounded-xl text-emerald-700 shadow-2xs">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Statutory Award &amp; Compensation Statement (Form-11)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  RFCTLARR Act 2013
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Survey No. {parcel.survey_number} • Khata {parcel.khata_number || 'N/A'} • {parcel.area_acres} Acres ({parcel.land_type})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-gov-navy" />
              <span>Computing statutory compensation under First &amp; Second Schedules...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : award ? (
            <>
              {/* Success Notification */}
              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Total Award Highlight Card */}
              <div className="bg-gradient-to-br from-slate-900 via-gov-navy to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Net Approved Statutory Compensation Award
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {award.dbt_disbursement.payout_status === 'disbursed' ? 'Disbursed via DBT' : 'Ready for Award Decree'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-700/60 pb-3">
                  <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                    ₹{award.total_statutory_award.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-400">
                    Landowners: <strong className="text-slate-200">{award.landowner_names.join(', ')}</strong>
                  </div>
                </div>

                {/* 4 Statutory Schedule Columns */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                      1. Land Value ({award.multiplier_factor}x)
                    </span>
                    <strong className="text-white font-mono text-sm">
                      ₹{award.multiplied_land_value.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                      2. Solatium (100%)
                    </span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      ₹{award.solatium_amount.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                      3. Interest @ 12%
                    </span>
                    <strong className="text-amber-300 font-mono text-sm">
                      ₹{award.additional_interest_amount.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                      4. R&amp;R Package
                    </span>
                    <strong className="text-blue-300 font-mono text-sm">
                      ₹{award.rr_entitlements.total_rr_value.toLocaleString('en-IN')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Direct Benefit Transfer (DBT) / PFMS Settlement Section */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold text-gov-slate uppercase tracking-wider">
                      Direct Benefit Transfer (DBT / PFMS) Settlement
                    </span>
                  </div>
                  {award.dbt_disbursement.aadhaar_verified && (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Aadhaar Linked &amp; Verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Bank Account</span>
                    <span className="font-mono font-bold text-gov-navy">{award.dbt_disbursement.bank_account_masked}</span>
                    <span className="text-[10px] text-slate-500 block font-mono">IFSC: {award.dbt_disbursement.ifsc_code}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Disbursement Status</span>
                    <span
                      className={`font-semibold capitalize ${
                        award.dbt_disbursement.payout_status === 'disbursed'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {award.dbt_disbursement.payout_status}
                    </span>
                    {award.dbt_disbursement.utr_number && (
                      <span className="text-[10px] text-slate-500 block font-mono">
                        UTR: {award.dbt_disbursement.utr_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    {award.dbt_disbursement.payout_status !== 'disbursed' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleDisburseDBT}
                        disabled={isDisbursing}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs w-full sm:w-auto"
                      >
                        {isDisbursing ? (
                          <span className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            <span>Processing...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Send className="h-3 w-3" />
                            <span>Initiate DBT Disbursement</span>
                          </span>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Transferred to Account
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Statutory Valuation Controls */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-gov-navy" />
                    <span className="text-xs font-bold text-gov-slate uppercase tracking-wider">
                      Statutory Valuation Parameters &amp; Assets
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecalculate}
                    disabled={isCalculating}
                    className="text-[11px] font-semibold text-gov-navy hover:underline flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${isCalculating ? 'animate-spin' : ''}`} />
                    <span>Recalculate Award</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Circle Rate / Market Rate (₹/Acre)
                    </label>
                    <input
                      type="number"
                      step="50000"
                      value={circleRate}
                      onChange={(e) => setCircleRate(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Distance from Urban Municipality
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={distanceKm}
                        onChange={(e) => setDistanceKm(Number(e.target.value))}
                        className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                      />
                      <span className="text-xs text-slate-500 font-mono">km</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Interest Accrual Timeline (Days)
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="1500"
                      value={accrualDays}
                      onChange={(e) => setAccrualDays(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Trees Valuation (₹)
                    </label>
                    <input
                      type="number"
                      step="5000"
                      value={treesValue}
                      onChange={(e) => setTreesValue(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Structures / Wall Value (₹)
                    </label>
                    <input
                      type="number"
                      step="5000"
                      value={structuresValue}
                      onChange={(e) => setStructuresValue(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Tubewell / Borewell (₹)
                    </label>
                    <input
                      type="number"
                      step="5000"
                      value={tubewellValue}
                      onChange={(e) => setTubewellValue(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-gov-navy"
                    />
                  </div>
                </div>
              </div>

              {/* Form-11 Gazette Decree Preview Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDecreePreview(!showDecreePreview)}
                  className="text-xs font-semibold text-gov-navy hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{showDecreePreview ? 'Hide Official Gazette Decree Text' : 'View Official Form-11 Gazette Award Decree Text'}</span>
                </button>

                {showDecreePreview && (
                  <div className="mt-2 p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-60 custom-scrollbar">
                    {award.form_11_gazette_decree}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Pinned Modal Footer */}
        <div className="px-6 py-4 bg-slate-50/95 backdrop-blur-sm border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-mono">
            {award ? `Order Ref: ${award.statutory_order_reference}` : 'Statutory RFCTLARR Engine'}
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintDecree}
              disabled={!award}
              className="text-xs px-3.5 flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Form-11 Decree</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="bg-gov-navy hover:bg-gov-blue text-white text-xs px-4"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
