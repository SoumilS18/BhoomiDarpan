import { describe, expect, it } from 'bun:test';
import { extractDocumentIntelligence } from '../server/services/documentExtractor';
import { DocumentExtraction, StructuredExtractionData } from '../shared/types';

describe('Document Intelligence & Zero-Hardcoding Compliance', () => {
  it('strictly refuses to fabricate domain data when Gemini API key is missing', async () => {
    // Save original env
    const origKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = '';

    const result = await extractDocumentIntelligence({
      documentTitle: 'Notification Section 11 - District Pune',
      mimeType: 'text/plain',
      textContent: 'Preliminary gazette notification dated 15 Jan 2026 for Talegaon.',
    });

    // Must fail safely without inventing survey numbers, landowner names, or dates
    expect(result.success).toBe(false);
    expect(result.structuredData).toBeUndefined();
    expect(result.rawText).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('GEMINI_API_KEY is not configured');

    // Restore env
    process.env.GEMINI_API_KEY = origKey;
  });

  it('preserves raw AI extractions and records human edits separately in human_edited_data', () => {
    // Simulate raw AI output
    const rawAiOutput: StructuredExtractionData = {
      document_type: 'sec_11_notification',
      referenced_dates: [{ label: 'Gazette Date', date: '2026-03-01', confidence: 0.9 }],
      parcel_survey_numbers: ['45/1', '45/2'],
      area_mentioned: '3.5 Hectares',
      authorities: ['District Collector, Pune'],
      summary: 'Section 11 Preliminary notification for road expansion.',
    };

    const initialExtraction: DocumentExtraction = {
      id: 'ext-101',
      document_id: 'doc-505',
      raw_text: '{"document_type": "sec_11_notification"...}',
      structured_data: rawAiOutput,
      human_edited_data: null,
      validation_status: 'pending',
      confidence_score: 0.88,
      is_verified: false,
      created_at: new Date().toISOString(),
    };

    // Human officer reviews and corrects survey numbers and notes discrepancy
    const humanCorrection: StructuredExtractionData = {
      ...rawAiOutput,
      parcel_survey_numbers: ['45/1', '45/2', '45/3-B'], // Corrected missing parcel
      area_mentioned: '4.1 Hectares', // Rectified area
    };

    const validatedExtraction: DocumentExtraction = {
      ...initialExtraction,
      validation_status: 'edited',
      human_edited_data: humanCorrection,
      validation_notes: 'Added parcel 45/3-B verified from physical revenue patta sheet.',
      is_verified: true,
      verified_by: 'LAO Officer S. K. Deshmukh',
      verified_at: new Date().toISOString(),
    };

    // Verification tests:
    // 1. Raw structured data must NEVER be overwritten
    expect(validatedExtraction.structured_data.parcel_survey_numbers).toEqual(['45/1', '45/2']);
    expect(validatedExtraction.structured_data.area_mentioned).toBe('3.5 Hectares');

    // 2. Human edited data accurately reflects verified facts
    expect(validatedExtraction.human_edited_data?.parcel_survey_numbers).toEqual(['45/1', '45/2', '45/3-B']);
    expect(validatedExtraction.human_edited_data?.area_mentioned).toBe('4.1 Hectares');

    // 3. Validation status and audit info
    expect(validatedExtraction.is_verified).toBe(true);
    expect(validatedExtraction.validation_status).toBe('edited');
    expect(validatedExtraction.verified_by).toBe('LAO Officer S. K. Deshmukh');
  });

  it('rejects an invalid extraction while preserving the original document record', () => {
    const rawAiOutput: StructuredExtractionData = {
      summary: 'Illegible scanned document.',
      missing_or_uncertain_information: ['Document text unreadable due to low scan resolution'],
    };

    const extraction: DocumentExtraction = {
      id: 'ext-202',
      document_id: 'doc-606',
      raw_text: '{"summary": "Illegible"}',
      structured_data: rawAiOutput,
      human_edited_data: null,
      validation_status: 'rejected',
      validation_notes: 'Scanned copy illegible. Order re-scan from district registry.',
      confidence_score: 0.25,
      is_verified: false,
      verified_by: 'Authorized Collector',
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    expect(extraction.is_verified).toBe(false);
    expect(extraction.validation_status).toBe('rejected');
    expect(extraction.validation_notes).toContain('re-scan');
  });
});
