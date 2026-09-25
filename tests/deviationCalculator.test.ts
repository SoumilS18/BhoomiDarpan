import { describe, expect, it } from 'bun:test';
import {
  calculateDaysBetween,
  addDaysToDate,
  calculateStageDeviations,
  calculateCaseMetrics,
} from '../server/services/deviationCalculator';
import { CaseStageInstance } from '../shared/types';

describe('Deviation Calculator & Timeline Math', () => {
  it('correctly calculates days between two ISO dates', () => {
    expect(calculateDaysBetween('2026-01-01', '2026-01-15')).toBe(14);
    expect(calculateDaysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(calculateDaysBetween('2026-02-01', '2026-01-01')).toBe(-31);
  });

  it('correctly shifts date by N days', () => {
    expect(addDaysToDate('2026-01-01', 30)).toBe('2026-01-31');
    expect(addDaysToDate('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('computes positive deviation when a completed stage finishes late', () => {
    const mockStages: CaseStageInstance[] = [
      {
        id: 'stage-1',
        case_id: 'case-test-1',
        stage_id: 'stg-1',
        status: 'completed',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-30',
        actual_start_date: '2026-01-01',
        actual_end_date: '2026-02-10', // 11 days late
        delay_days: 0,
        updated_at: '2026-02-10',
      },
    ];

    const deviations = calculateStageDeviations(mockStages, '2026-02-15');
    expect(deviations[0].delay_days).toBe(11);
    expect(deviations[0].stage_deviation_days).toBe(11);
  });

  it('detects overdue days dynamically for an active stage past expected end date', () => {
    const mockStages: CaseStageInstance[] = [
      {
        id: 'stage-2',
        case_id: 'case-test-2',
        stage_id: 'stg-2',
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-30',
        actual_start_date: '2026-01-01',
        actual_end_date: undefined,
        delay_days: 0,
        updated_at: '2026-01-01',
      },
    ];

    // Tested on 2026-02-15 (16 days past expected end date)
    const deviations = calculateStageDeviations(mockStages, '2026-02-15');
    expect(deviations[0].is_overdue).toBe(true);
    expect(deviations[0].overdue_days).toBe(16);
    expect(deviations[0].delay_days).toBe(16);
  });

  it('calculates portfolio-level case metrics dynamically without hardcoding', () => {
    const mockStages: CaseStageInstance[] = [
      {
        id: 'stage-1',
        case_id: 'case-test-3',
        stage_id: 'stg-1',
        status: 'completed',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-30',
        actual_start_date: '2026-01-01',
        actual_end_date: '2026-01-30',
        delay_days: 0,
        updated_at: '2026-01-30',
      },
      {
        id: 'stage-2',
        case_id: 'case-test-3',
        stage_id: 'stg-2',
        status: 'in_progress',
        expected_start_date: '2026-01-31',
        expected_end_date: '2026-03-01',
        actual_start_date: '2026-01-31',
        actual_end_date: undefined,
        delay_days: 0,
        updated_at: '2026-01-31',
      },
    ];

    const metrics = calculateCaseMetrics({
      startDate: '2026-01-01',
      expectedCompletionDate: '2026-05-01',
      stageInstances: mockStages,
      currentDateStr: '2026-02-15',
    });

    expect(metrics.total_stages).toBe(2);
    expect(metrics.completed_stages).toBe(1);
    expect(metrics.progress_percentage).toBeGreaterThan(0);
    expect(metrics.is_delayed).toBe(false); // Within expected completion date
    expect(metrics.days_overdue).toBe(0);
  });
});
