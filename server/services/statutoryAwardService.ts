import {
  StatutoryAwardCalculation,
  CaseAwardSummary,
  Parcel,
  AcquisitionCase,
  AssetsValuation,
  RrEntitlements,
  DbtDisbursement,
} from '../../shared/types';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { logCaseEvent } from './auditLogger';
import { AuthenticatedUser } from '../middleware/auth.middleware';
import { getScopedCases, getParcelsForCase } from './spatialIntelligenceService';

// In-memory award calculation store for test isolation & real-time responsiveness
const inMemoryAwards = new Map<string, StatutoryAwardCalculation>();

export function clearInMemoryAwards() {
  inMemoryAwards.clear();
}

/**
 * Default circle rates per acre based on land classification in INR
 */
export const DEFAULT_CIRCLE_RATES: Record<string, number> = {
  agricultural: 1200000, // 12 Lakhs / acre
  residential: 2500000,  // 25 Lakhs / acre
  commercial: 4000000,   // 40 Lakhs / acre
  industrial: 3000000,   // 30 Lakhs / acre
  default: 1500000,
};

/**
 * Calculates First Schedule multiplier factor based on statutory distance from urban boundaries.
 * RFCTLARR Act 2013 First Schedule: Factor between 1.00 (Urban) and 2.00 (Remote Rural).
 */
export function calculateRuralMultiplier(distanceFromUrbanKm = 15): number {
  if (distanceFromUrbanKm <= 10) return 1.0;
  if (distanceFromUrbanKm <= 20) return 1.25;
  if (distanceFromUrbanKm <= 30) return 1.5;
  if (distanceFromUrbanKm < 50) return 1.75;
  return 2.0;
}

export interface CalculateAwardOptions {
  circleRatePerAcre?: number;
  multiplierFactor?: number;
  distanceFromUrbanKm?: number;
  assets?: Partial<AssetsValuation>;
  rrEntitlements?: Partial<RrEntitlements>;
  interestAccrualDays?: number;
  statutoryOrderReference?: string;
}

/**
 * Computes statutory compensation award for a cadastral parcel under RFCTLARR 2013.
 */
export function computeStatutoryParcelAward(
  parcel: Parcel,
  caseItem: AcquisitionCase,
  options: CalculateAwardOptions = {}
): StatutoryAwardCalculation {
  const landTypeKey = (parcel.land_type || 'agricultural').toLowerCase();
  const circleRatePerAcre = options.circleRatePerAcre || DEFAULT_CIRCLE_RATES[landTypeKey] || DEFAULT_CIRCLE_RATES.default;
  const areaAcres = Math.max(0.01, parcel.area_acres || 1.0);

  // 1. Base Market Value of Land
  const baseMarketValue = Math.round(circleRatePerAcre * areaAcres);

  // 2. Multiplier Factor (RFCTLARR First Schedule)
  const multiplierFactor = options.multiplierFactor || (options.distanceFromUrbanKm !== undefined ? calculateRuralMultiplier(options.distanceFromUrbanKm) : 1.25);
  const multipliedLandValue = Math.round(baseMarketValue * multiplierFactor);

  // 3. Immovable Assets / Trees / Structures Valuation
  const assets: AssetsValuation = {
    trees_count: options.assets?.trees_count || 4,
    trees_value: options.assets?.trees_value !== undefined ? options.assets.trees_value : 25000,
    structures_value: options.assets?.structures_value !== undefined ? options.assets.structures_value : 50000,
    tubewell_count: options.assets?.tubewell_count || 1,
    tubewell_value: options.assets?.tubewell_value !== undefined ? options.assets.tubewell_value : 35000,
    total_assets_value: 0,
  };
  assets.total_assets_value = assets.trees_value + assets.structures_value + assets.tubewell_value;

  // 4. Total Market Value (Land + Assets)
  const totalMarketValue = multipliedLandValue + assets.total_assets_value;

  // 5. 100% Solatium (RFCTLARR Section 30(1))
  const solatiumPercentage = 100;
  const solatiumAmount = totalMarketValue; // Exactly 100%

  // 6. 12% Additional Interest from Section 11 Preliminary Notification (RFCTLARR Section 30(3))
  const additionalInterestPercentage = 12;
  const interestAccrualDays = options.interestAccrualDays !== undefined ? options.interestAccrualDays : 180; // default 6 months
  const additionalInterestAmount = Math.round((totalMarketValue * 0.12 * interestAccrualDays) / 365);

  // 7. Second Schedule Rehabilitation & Resettlement (R&R) Entitlements
  const rr: RrEntitlements = {
    subsistence_grant: options.rrEntitlements?.subsistence_grant !== undefined ? options.rrEntitlements.subsistence_grant : 36000, // ₹3,000/mo x 12
    transportation_grant: options.rrEntitlements?.transportation_grant !== undefined ? options.rrEntitlements.transportation_grant : 50000,
    cattle_shed_grant: options.rrEntitlements?.cattle_shed_grant !== undefined ? options.rrEntitlements.cattle_shed_grant : 25000,
    housing_allowance: options.rrEntitlements?.housing_allowance !== undefined ? options.rrEntitlements.housing_allowance : 150000,
    total_rr_value: 0,
  };
  rr.total_rr_value = rr.subsistence_grant + rr.transportation_grant + rr.cattle_shed_grant + rr.housing_allowance;

  // 8. Net Total Statutory Award
  const totalStatutoryAward = totalMarketValue + solatiumAmount + additionalInterestAmount + rr.total_rr_value;

  const orderRef = options.statutoryOrderReference || `AWD/${caseItem.case_number}/${parcel.survey_number}`;

  // Default DBT disbursement profile
  const dbt: DbtDisbursement = {
    payout_status: 'pending',
    bank_account_masked: 'XXXX-XXXX-' + (1000 + Math.floor(Math.random() * 9000)),
    ifsc_code: 'SBIN0001234',
    aadhaar_verified: true,
  };

  const decreeText = `
GOVERNMENT OF INDIA / STATE REVENUE DEPARTMENT
STATUTORY AWARD DECREE (FORM-11)
Under Section 23, 27, 30 & First/Second Schedule of RFCTLARR Act, 2013

Case Reference: ${caseItem.case_number} (${caseItem.title})
Administrative Jurisdiction: Village ${caseItem.village}, Tehsil ${caseItem.tehsil || 'N/A'}, District ${caseItem.district}, State ${caseItem.state}
Cadastral Parcel: Survey No. ${parcel.survey_number} (Khata: ${parcel.khata_number || 'N/A'})
Recorded Landowners: ${(parcel.landowner_names || []).join(', ')}
Acquired Area: ${areaAcres} Acres (${parcel.land_type})

ITEMIZED STATUTORY VALUATION & APPORTIONMENT:
1. Base Land Value (Circle Rate @ ₹${circleRatePerAcre.toLocaleString('en-IN')}/Acre): ₹${baseMarketValue.toLocaleString('en-IN')}
2. Rural Distance Multiplier Factor (${multiplierFactor}x): ₹${multipliedLandValue.toLocaleString('en-IN')}
3. Immovable Assets / Trees / Structures: ₹${assets.total_assets_value.toLocaleString('en-IN')}
   - Fruit/Timber Trees (${assets.trees_count} Nos): ₹${assets.trees_value.toLocaleString('en-IN')}
   - Agricultural Tubewell / Borewell (${assets.tubewell_count} Nos): ₹${assets.tubewell_value.toLocaleString('en-IN')}
   - Boundary Wall / Structures: ₹${assets.structures_value.toLocaleString('en-IN')}
---------------------------------------------------------------------------------
TOTAL BASE MARKET VALUE (A): ₹${totalMarketValue.toLocaleString('en-IN')}
4. Mandatory Solatium @ 100% under Section 30(1) (B): ₹${solatiumAmount.toLocaleString('en-IN')}
5. Additional Interest @ 12% p.a. (${interestAccrualDays} days accrued) under Section 30(3) (C): ₹${additionalInterestAmount.toLocaleString('en-IN')}
6. Second Schedule R&R Entitlements & Grants (D): ₹${rr.total_rr_value.toLocaleString('en-IN')}
   - Subsistence Grant (12 Months): ₹${rr.subsistence_grant.toLocaleString('en-IN')}
   - One-Time Resettlement & Transport Allowance: ₹${rr.transportation_grant.toLocaleString('en-IN')}
   - Cattle Shed / Agricultural Grant: ₹${rr.cattle_shed_grant.toLocaleString('en-IN')}
   - Housing Allowance: ₹${rr.housing_allowance.toLocaleString('en-IN')}
---------------------------------------------------------------------------------
TOTAL STATUTORY AWARD (A + B + C + D): ₹${totalStatutoryAward.toLocaleString('en-IN')}

Order Reference: ${orderRef}
Authorized Competent Authority: Land Acquisition Officer (LAO)
`.trim();

  return {
    parcel_id: parcel.id,
    case_id: caseItem.id,
    survey_number: parcel.survey_number,
    khata_number: parcel.khata_number,
    landowner_names: parcel.landowner_names || [],
    land_type: parcel.land_type,
    area_acres: areaAcres,
    circle_rate_per_acre: circleRatePerAcre,
    base_market_value: baseMarketValue,
    multiplier_factor: multiplierFactor,
    multiplied_land_value: multipliedLandValue,
    assets_valuation: assets,
    total_market_value: totalMarketValue,
    solatium_percentage: solatiumPercentage,
    solatium_amount: solatiumAmount,
    additional_interest_percentage: additionalInterestPercentage,
    interest_accrual_days: interestAccrualDays,
    additional_interest_amount: additionalInterestAmount,
    rr_entitlements: rr,
    total_statutory_award: totalStatutoryAward,
    dbt_disbursement: dbt,
    statutory_order_reference: orderRef,
    form_11_gazette_decree: decreeText,
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Retrieves or generates statutory award calculations for all parcels in a case.
 */
export async function getCaseStatutoryAwards(
  caseId: string,
  user?: AuthenticatedUser
): Promise<CaseAwardSummary> {
  const scopedCases = await getScopedCases(user);
  const caseItem = scopedCases.find((c) => c.id === caseId);

  if (!caseItem) {
    throw new Error(`Case ${caseId} not found or outside authorized operational jurisdiction.`);
  }

  const parcels = await getParcelsForCase(caseId);
  const awards: StatutoryAwardCalculation[] = [];

  for (const parcel of parcels) {
    let award = inMemoryAwards.get(parcel.id);
    if (!award) {
      award = computeStatutoryParcelAward(parcel, caseItem);
      inMemoryAwards.set(parcel.id, award);
    }
    awards.push(award);
  }

  // Aggregate case summary
  let totalAreaAcres = 0;
  let totalBaseMarketValue = 0;
  let totalSolatium = 0;
  let totalAdditionalInterest = 0;
  let totalRrEntitlements = 0;
  let totalStatutoryAward = 0;
  let totalDisbursedAmount = 0;
  let totalPendingAmount = 0;

  for (const a of awards) {
    totalAreaAcres += a.area_acres;
    totalBaseMarketValue += a.base_market_value;
    totalSolatium += a.solatium_amount;
    totalAdditionalInterest += a.additional_interest_amount;
    totalRrEntitlements += a.rr_entitlements.total_rr_value;
    totalStatutoryAward += a.total_statutory_award;

    if (a.dbt_disbursement.payout_status === 'disbursed') {
      totalDisbursedAmount += a.dbt_disbursement.disbursed_amount || a.total_statutory_award;
    } else {
      totalPendingAmount += a.total_statutory_award;
    }
  }

  return {
    case_id: caseItem.id,
    case_number: caseItem.case_number,
    title: caseItem.title,
    total_parcels: awards.length,
    total_area_acres: Number(totalAreaAcres.toFixed(2)),
    total_base_market_value: totalBaseMarketValue,
    total_solatium: totalSolatium,
    total_additional_interest: totalAdditionalInterest,
    total_rr_entitlements: totalRrEntitlements,
    total_statutory_award: totalStatutoryAward,
    total_disbursed_amount: totalDisbursedAmount,
    total_pending_amount: totalPendingAmount,
    awards,
  };
}

/**
 * Calculates and persists updated statutory award for a specific parcel.
 */
export async function updateParcelStatutoryAward(
  caseId: string,
  parcelId: string,
  options: CalculateAwardOptions,
  user?: AuthenticatedUser
): Promise<StatutoryAwardCalculation> {
  const scopedCases = await getScopedCases(user);
  const caseItem = scopedCases.find((c) => c.id === caseId);
  if (!caseItem) {
    throw new Error(`Case ${caseId} not found or outside authorized jurisdiction.`);
  }

  const parcels = await getParcelsForCase(caseId);
  const parcel = parcels.find((p) => p.id === parcelId);
  if (!parcel) {
    throw new Error(`Parcel ${parcelId} not found in case ${caseId}.`);
  }

  const updatedAward = computeStatutoryParcelAward(parcel, caseItem, options);
  inMemoryAwards.set(parcelId, updatedAward);

  // Update parcel compensation amount in database
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    await supabase
      .from('parcels')
      .update({
        compensation_amount: updatedAward.total_statutory_award,
        acquisition_status: 'awarded',
      })
      .eq('id', parcelId);
  }

  await logCaseEvent({
    case_id: caseId,
    event_type: 'CASE_PARCEL_ADDED' as any,
    title: `Statutory Award Calculated: Survey #${parcel.survey_number}`,
    description: `Award of ₹${updatedAward.total_statutory_award.toLocaleString('en-IN')} approved under RFCTLARR Section 23/30 (Solatium: ₹${updatedAward.solatium_amount.toLocaleString('en-IN')}).`,
    actor_name: user?.full_name || 'Land Acquisition Officer',
    metadata: {
      parcel_id: parcelId,
      survey_number: parcel.survey_number,
      total_award: updatedAward.total_statutory_award,
      solatium: updatedAward.solatium_amount,
      multiplier: updatedAward.multiplier_factor,
    },
  });

  return updatedAward;
}

/**
 * Disburses statutory compensation payout via Direct Benefit Transfer (DBT) / PFMS.
 */
export async function disburseParcelDBT(
  caseId: string,
  parcelId: string,
  payoutDetails: {
    utrNumber?: string;
    disbursedAmount?: number;
    notes?: string;
  },
  user?: AuthenticatedUser
): Promise<StatutoryAwardCalculation> {
  const scopedCases = await getScopedCases(user);
  const caseItem = scopedCases.find((c) => c.id === caseId);
  if (!caseItem) {
    throw new Error(`Case ${caseId} not found or outside authorized scope.`);
  }

  const award = inMemoryAwards.get(parcelId) || (await (async () => {
    const parcels = await getParcelsForCase(caseId);
    const parcel = parcels.find((p) => p.id === parcelId);
    if (!parcel) throw new Error(`Parcel ${parcelId} not found.`);
    const computed = computeStatutoryParcelAward(parcel, caseItem);
    inMemoryAwards.set(parcelId, computed);
    return computed;
  })());

  const utr = payoutDetails.utrNumber || `PFMS${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pfmsRef = `PFMS-DBT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const ackToken = `ACK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const amount = payoutDetails.disbursedAmount || award.total_statutory_award;

  award.dbt_disbursement = {
    payout_status: 'disbursed',
    bank_name: (payoutDetails as any).bank_name || 'State Bank of India',
    bank_account_masked: award.dbt_disbursement.bank_account_masked,
    ifsc_code: (payoutDetails as any).ifsc_code || award.dbt_disbursement.ifsc_code || 'SBIN0001234',
    aadhaar_verified: true,
    utr_number: utr,
    pfms_reference_id: pfmsRef,
    acknowledgment_token: ackToken,
    disbursed_at: new Date().toISOString(),
    disbursed_amount: amount,
    disbursed_by: user?.full_name || 'Competent Authority',
  };

  inMemoryAwards.set(parcelId, award);

  // Update parcel status
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    await supabase
      .from('parcels')
      .update({ acquisition_status: 'disbursed' })
      .eq('id', parcelId);
  }

  await logCaseEvent({
    case_id: caseId,
    event_type: 'CASE_STAGE_ADVANCED' as any,
    title: `Direct Benefit Transfer (DBT) Disbursed: Survey #${award.survey_number}`,
    description: `Compensation of ₹${amount.toLocaleString('en-IN')} disbursed to ${award.landowner_names.join(', ')} via PFMS (UTR: ${utr}).`,
    actor_name: user?.full_name || 'Competent Authority',
    metadata: {
      parcel_id: parcelId,
      survey_number: award.survey_number,
      utr_number: utr,
      amount,
      notes: payoutDetails.notes,
    },
  });

  return award;
}
