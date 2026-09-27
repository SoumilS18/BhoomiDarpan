import { describe, expect, it } from 'bun:test';
import {
  calculateRuralMultiplier,
  computeStatutoryParcelAward,
  getCaseStatutoryAwards,
  updateParcelStatutoryAward,
  disburseParcelDBT,
  clearInMemoryAwards,
} from '../server/services/statutoryAwardService';
import { seedSpatialMemoryStore } from '../server/services/spatialIntelligenceService';
import { AcquisitionCase, Parcel } from '../shared/types';

describe('RFCTLARR Act 2013 Statutory Award & Form-11 Engine', () => {
  describe('calculateRuralMultiplier (First Schedule)', () => {
    it('applies 1.00x multiplier for urban parcels within 10 km', () => {
      expect(calculateRuralMultiplier(0)).toBe(1.0);
      expect(calculateRuralMultiplier(5)).toBe(1.0);
      expect(calculateRuralMultiplier(10)).toBe(1.0);
    });

    it('interpolates multiplier between 10 km and 50 km', () => {
      expect(calculateRuralMultiplier(30)).toBe(1.5);
      expect(calculateRuralMultiplier(20)).toBe(1.25);
      expect(calculateRuralMultiplier(40)).toBe(1.75);
    });

    it('caps multiplier at 2.00x for distances >= 50 km', () => {
      expect(calculateRuralMultiplier(50)).toBe(2.0);
      expect(calculateRuralMultiplier(75)).toBe(2.0);
      expect(calculateRuralMultiplier(120)).toBe(2.0);
    });
  });

  describe('computeStatutoryParcelAward', () => {
    const mockCase: AcquisitionCase = {
      id: 'case-test-101',
      case_number: 'LA-2026-DEL-001',
      title: 'Delhi-Jaipur Expressway Alignment',
      project_id: 'proj-1',
      state: 'Maharashtra',
      district: 'Pune',
      village: 'Hinjawadi',
      village_lgd_code: 554321,
      total_area_hectares: 10.5,
      estimated_compensation: 50000000,
      status: 'in_progress',
      start_date: '2025-01-01',
      priority: 'high',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const mockParcel: Parcel = {
      id: 'parcel-test-01',
      case_id: 'case-test-101',
      survey_number: '124/1A',
      landowner_names: ['Rajesh Patil'],
      area_acres: 2.5,
      circle_rate_per_acre: 1000000, // 10 Lakhs per acre
      land_type: 'agricultural',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    it('computes exact statutory math with solatium, interest, and assets', () => {
      // 2.5 acres @ 10,00,000 = 25,00,000 base
      // distance = 30 km -> multiplier = 1.5 -> land value = 37,50,000
      // assets: 10 trees (value 150,000) + 1 tubewell (value 120,000) + structure (value 250,000)
      // total assets = 520,000
      // Market value (A) = 37,50,000 + 520,000 = 42,70,000
      // Solatium 100% (B) = 42,70,000
      // Interest 12% p.a. for 365 days on (A) = 512,400
      // Second Schedule R&R: subsistence 36,000 + transport 50,000 + cattle shed 25,000 + housing 150,000 = 261,000
      // Net award = 42,70,000 + 42,70,000 + 512,400 + 261,000 = 9,313,400

      const award = computeStatutoryParcelAward(mockParcel, mockCase, {
        circleRatePerAcre: 1000000,
        distanceFromUrbanKm: 30,
        assets: {
          trees_count: 10,
          trees_value: 150000,
          tubewell_count: 1,
          tubewell_value: 120000,
          structures_value: 250000,
        },
        rrEntitlements: {
          subsistence_grant: 36000,
          transportation_grant: 50000,
          cattle_shed_grant: 25000,
          housing_allowance: 150000,
        },
        interestAccrualDays: 365,
      });

      expect(award.base_market_value).toBe(2500000);
      expect(award.multiplier_factor).toBe(1.5);
      expect(award.multiplied_land_value).toBe(3750000);
      expect(award.assets_valuation.total_assets_value).toBe(520000);
      expect(award.total_market_value).toBe(4270000);
      expect(award.solatium_amount).toBe(4270000);
      expect(award.additional_interest_amount).toBe(512400);
      expect(award.rr_entitlements.total_rr_value).toBe(261000);
      expect(award.total_statutory_award).toBe(9313400);
      expect(award.form_11_gazette_decree).toContain('STATUTORY AWARD DECREE (FORM-11)');
      expect(award.form_11_gazette_decree).toContain('Hinjawadi');
      expect(award.form_11_gazette_decree).toContain('Rajesh Patil');
    });

    it('handles zero assets and urban zone (1.00x multiplier) gracefully', () => {
      const award = computeStatutoryParcelAward(mockParcel, mockCase, {
        circleRatePerAcre: 1000000,
        distanceFromUrbanKm: 5,
        assets: {
          trees_count: 0,
          trees_value: 0,
          tubewell_count: 0,
          tubewell_value: 0,
          structures_value: 0,
        },
        rrEntitlements: {
          subsistence_grant: 0,
          transportation_grant: 0,
          cattle_shed_grant: 0,
          housing_allowance: 0,
        },
        interestAccrualDays: 0,
      });

      expect(award.multiplier_factor).toBe(1.0);
      expect(award.base_market_value).toBe(2500000);
      expect(award.multiplied_land_value).toBe(2500000);
      expect(award.total_market_value).toBe(2500000);
      expect(award.solatium_amount).toBe(2500000);
      expect(award.additional_interest_amount).toBe(0);
      expect(award.rr_entitlements.total_rr_value).toBe(0);
      expect(award.total_statutory_award).toBe(5000000);
    });
  });

  describe('DBT PFMS Disbursement and Award Management', () => {
    it('updates parcel award configuration and performs DBT disbursement', async () => {
      clearInMemoryAwards();

      const testCase: AcquisitionCase = {
        id: 'case-stat-test-1',
        case_number: 'LA-2026-PUN-099',
        title: 'Ring Road Phase-IV',
        project_id: 'proj-pune',
        state: 'Maharashtra',
        district: 'Pune',
        village: 'Kharadi',
        total_area_hectares: 12.0,
        estimated_compensation: 40000000,
        status: 'in_progress',
        priority: 'high',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const testParcel: Parcel = {
        id: 'parcel-stat-test-1',
        case_id: 'case-stat-test-1',
        survey_number: '88/2B',
        landowner_names: ['Ganesh Deshmukh'],
        area_acres: 1.5,
        circle_rate_per_acre: 2000000,
        land_type: 'agricultural',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      seedSpatialMemoryStore({ cases: [testCase], parcels: [testParcel] });

      const caseSummary = await getCaseStatutoryAwards('case-stat-test-1');
      expect(caseSummary).toBeDefined();
      expect(caseSummary.awards.length).toBe(1);

      const targetAward = caseSummary.awards[0];
      const updated = await updateParcelStatutoryAward('case-stat-test-1', targetAward.parcel_id, {
        distanceFromUrbanKm: 25,
      });
      expect(updated.multiplier_factor).toBe(1.5);

      const disbursed = await disburseParcelDBT('case-stat-test-1', targetAward.parcel_id, {
        bank_name: 'State Bank of India',
        ifsc_code: 'SBIN0001234',
        account_number: '123456789012',
      });
      expect(disbursed.dbt_disbursement.payout_status).toBe('disbursed');
      expect(disbursed.dbt_disbursement.pfms_reference_id).toContain('PFMS-DBT-');
      expect(disbursed.dbt_disbursement.acknowledgment_token).toBeDefined();
    });
  });
});
