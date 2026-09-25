import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import {
  StructuredExtractionData,
  CaseDocument,
  WorkflowStage,
  CaseStageInstance,
  MissingDocumentReport,
} from '../../shared/types';

export const StructuredExtractionSchema = z.object({
  document_type: z.string().default('miscellaneous'),
  referenced_dates: z
    .array(
      z.object({
        label: z.string().default('Date'),
        date: z.string().nullable().optional(),
        relevance: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .default([]),
  project_identifiers: z.array(z.string()).default([]),
  case_identifiers: z.array(z.string()).default([]),
  parcel_survey_numbers: z.array(z.string()).default([]),
  area_mentioned: z.string().nullable().optional(),
  parties: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().default('Party'),
      })
    )
    .default([]),
  authorities: z.array(z.string()).default([]),
  deadlines: z
    .array(
      z.object({
        label: z.string(),
        date: z.string().nullable().optional(),
        urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      })
    )
    .default([]),
  monetary_values: z
    .array(
      z.object({
        amount: z.union([z.number(), z.string()]),
        currency: z.string().default('INR'),
        purpose: z.string().default('Compensation'),
      })
    )
    .default([]),
  missing_or_uncertain_information: z.array(z.string()).default([]),
  summary: z.string().default('Factual document summary.'),
  confidence_score: z.number().min(0).max(1).default(0.8),
});

export interface ExtractionResult {
  success: boolean;
  rawText?: string;
  structuredData?: StructuredExtractionData;
  confidenceScore?: number;
  error?: string;
}

const MAX_TEXT_CHARS = 60_000;
const MAX_BUFFER_BYTES = 15 * 1024 * 1024; // 15MB
const GEMINI_TIMEOUT_MS = 25_000; // 25s timeout

/**
 * Server-side document intelligence service using Google Gemini.
 * Strictly avoids fabricating domain information when Gemini is offline or fails.
 */
export async function extractDocumentIntelligence(params: {
  documentTitle: string;
  mimeType: string;
  textContent?: string;
  fileBuffer?: Buffer;
}): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your-gemini-api-key' || apiKey.trim() === '') {
    return {
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server. Automatic AI extraction is unavailable. Configure the key in .env or perform manual verification.',
    };
  }

  // 1. Input-size safeguards
  if (params.textContent && params.textContent.length > MAX_TEXT_CHARS) {
    params.textContent = params.textContent.slice(0, MAX_TEXT_CHARS);
  }

  if (params.fileBuffer && params.fileBuffer.length > MAX_BUFFER_BYTES) {
    return {
      success: false,
      error: `File size exceeds maximum supported AI extraction limit of 15MB (${(params.fileBuffer.length / (1024 * 1024)).toFixed(1)}MB provided). Please compress or perform manual data entry.`,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1, // Low temperature for high precision factual extraction
      },
    });

    const prompt = `You are an expert government legal document analyzer specialized in Indian land acquisition (e.g. RFCTLARR Act 2013, NHAI Act, State Land Acquisition).
Analyze the provided document text/content and extract structured factual information.

Document Title: ${params.documentTitle}
MIME Type: ${params.mimeType}

Extract strictly factual information that appears in the document. DO NOT fabricate or guess information.
If any field is missing, not mentioned, or ambiguous, return an empty array/null or list it in "missing_or_uncertain_information".

Return a strictly valid JSON object adhering to this schema:
{
  "document_type": "string (one of: preliminary_notice, sec_11_notification, hearing_minutes, survey_report, valuation_record, sec_19_declaration, award_order, possession_memo, litigation_filing, miscellaneous)",
  "referenced_dates": [
    { "label": "description of date (e.g. Gazette Publication Date, Survey Inspection Date)", "date": "YYYY-MM-DD", "relevance": "string", "confidence": 0.0-1.0 }
  ],
  "project_identifiers": ["string (e.g. Project names or codes referenced)"],
  "case_identifiers": ["string (e.g. Gazette numbers, case numbers, memo numbers)"],
  "parcel_survey_numbers": ["string (e.g. Survey numbers, Khata numbers mentioned)"],
  "area_mentioned": "string (e.g. '12.4 hectares' or '5 acres')",
  "parties": [
    { "name": "string", "role": "Landowner | Occupant | Claimant | Sponsoring Agency | Petitioner" }
  ],
  "authorities": ["string (e.g. District Collector, LAO, Competent Authority, Tehsildar)"],
  "deadlines": [
    { "label": "description of deadline (e.g. Section 15 Objection Filing Deadline)", "date": "YYYY-MM-DD", "urgency": "low | medium | high | critical" }
  ],
  "monetary_values": [
    { "amount": "number or string", "currency": "INR", "purpose": "Compensation | Solatium | Market Valuation | Deposit" }
  ],
  "missing_or_uncertain_information": ["string (list any critical statutory elements that appear absent or unclear)"],
  "summary": "Concise 2-3 sentence factual summary of the document's legal effect and main contents.",
  "confidence_score": 0.0-1.0 (overall confidence in the extracted data based on clarity and completeness)
}

Document Content:
"""
${params.textContent || 'Binary file uploaded for processing.'}
"""`;

    // 2. Timeout & model-fallback protected execution
    const candidateModels = [modelName, 'gemini-flash-latest'].filter((v, i, a) => a.indexOf(v) === i);
    let responseText = '';
    let lastErr: any = null;

    for (let pass = 0; pass < 2 && (!responseText || responseText.trim() === ''); pass++) {
      for (const candidate of candidateModels) {
        try {
          const candidateModel = genAI.getGenerativeModel({
            model: candidate,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const executionPromise = (async () => {
            let result;
            if (params.fileBuffer && (params.mimeType.startsWith('image/') || params.mimeType === 'application/pdf')) {
              const part = {
                inlineData: {
                  data: params.fileBuffer.toString('base64'),
                  mimeType: params.mimeType,
                },
              };
              result = await candidateModel.generateContent([prompt, part]);
            } else {
              result = await candidateModel.generateContent(prompt);
            }
            return result.response.text();
          })();

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Gemini extraction timed out after ${GEMINI_TIMEOUT_MS / 1000} seconds.`)), GEMINI_TIMEOUT_MS);
          });

          responseText = await Promise.race([executionPromise, timeoutPromise]);
          if (responseText && responseText.trim() !== '') {
            lastErr = null;
            break;
          }
        } catch (tryErr: any) {
          lastErr = tryErr;
          if (tryErr.message?.includes('503') || tryErr.message?.includes('demand')) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
    }

    if (lastErr && (!responseText || responseText.trim() === '')) {
      return {
        success: false,
        error: `Gemini API execution failed: ${lastErr.message || String(lastErr)}`,
      };
    }

    if (!responseText || responseText.trim() === '') {
      return {
        success: false,
        error: 'Gemini returned an empty response.',
      };
    }

    // 3. Clean and parse JSON (strip markdown fence if present)
    let jsonString = responseText.trim();
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.slice(7);
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.slice(3);
    }
    if (jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }
    jsonString = jsonString.trim();

    // Fallback regex to extract outermost JSON object if preface text is included
    const match = jsonString.match(/\{[\s\S]*\}/);
    if (match) {
      jsonString = match[0];
    }

    try {
      const rawJsonObj = JSON.parse(jsonString);
      const parseResult = StructuredExtractionSchema.safeParse(rawJsonObj);

      if (!parseResult.success) {
        return {
          success: false,
          rawText: responseText,
          error: `Extraction schema validation failed: ${parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
        };
      }

      const validData = parseResult.data as StructuredExtractionData;

      return {
        success: true,
        rawText: responseText,
        structuredData: validData,
        confidenceScore: validData.confidence_score,
      };
    } catch (jsonErr: any) {
      return {
        success: false,
        rawText: responseText,
        error: `Failed to parse Gemini structured JSON: ${jsonErr.message}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Gemini API execution failed: ${err.message || String(err)}`,
    };
  }
}

export interface SingleStageDocumentEvaluation {
  stage_id: string;
  stage_code?: string;
  stage_instance_id: string;
  stage_title: string;
  stage_number: number;
  stage_status: string;
  has_requirements: boolean;
  required_documents: string[];
  missing_documents: string[];
  uploaded_documents: string[];
  unverified_documents: string[];
  failed_documents: string[];
  verified_documents: string[];
  is_blocking: boolean;
  blocking_reasons: string[];
  all_satisfied: boolean;
}

/**
 * Evaluates document requirement status for a single workflow stage instance.
 * Honestly returns empty requirement state when stage has no required documents.
 */
export function detectMissingStageDocumentsForStage(params: {
  stage: WorkflowStage;
  stageInstance: CaseStageInstance;
  documents?: CaseDocument[];
}): SingleStageDocumentEvaluation {
  const { stage, stageInstance: inst, documents = [] } = params;
  const requiredDocs = stage.required_documents || [];

  if (requiredDocs.length === 0) {
    return {
      stage_id: stage.id,
      stage_code: stage.code,
      stage_instance_id: inst.id,
      stage_title: stage.title,
      stage_number: stage.stage_number,
      stage_status: inst.status,
      has_requirements: false,
      required_documents: [],
      missing_documents: [],
      uploaded_documents: [],
      unverified_documents: [],
      failed_documents: [],
      verified_documents: [],
      is_blocking: false,
      blocking_reasons: [],
      all_satisfied: true,
    };
  }

  // Filter documents associated with this stage or matching case-level statutory document type
  const stageDocs = documents.filter((d) => {
    if (d.stage_instance_id === inst.id) return true;
    if (d.case_id !== inst.case_id) return false;
    return requiredDocs.some((req) => {
      const normReq = req.toLowerCase().replace(/[^a-z0-9]/g, '');
      const docTypeStr = String(d.document_type || (d as any).doc_type || '');
      const normDocType = docTypeStr.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normTitle = (d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        docTypeStr === req ||
        normDocType.includes(normReq) ||
        normReq.includes(normDocType) ||
        normTitle.includes(normReq)
      );
    });
  });

  const verified: string[] = [];
  const unverified: string[] = [];
  const uploaded: string[] = [];
  const failed: string[] = [];
  const missing: string[] = [];
  const blockingReasons: string[] = [];

  for (const req of requiredDocs) {
    const normReq = req.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedDocs = stageDocs.filter((d) => {
      const docTypeStr = String(d.document_type || (d as any).doc_type || '');
      const normDocType = docTypeStr.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normTitle = (d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        docTypeStr === req ||
        normDocType.includes(normReq) ||
        normReq.includes(normDocType) ||
        normTitle.includes(normReq)
      );
    });

    if (matchedDocs.length === 0) {
      missing.push(req);
      blockingReasons.push(`Mandatory statutory document "${req}" is missing from vault.`);
    } else {
      const isVerified = matchedDocs.some((d) => d.status === 'verified');
      const isFailed = matchedDocs.some((d) => d.status === 'failed' || d.status === 'rejected');
      const isPending = matchedDocs.some(
        (d) => d.status === 'validation_required' || d.status === 'processing'
      );
      const isUploadedOnly = matchedDocs.some(
        (d) => d.status === 'uploaded' || d.status === 'processed' || d.status === 'extracted'
      );

      if (isVerified) {
        verified.push(req);
      } else if (isFailed) {
        failed.push(req);
        blockingReasons.push(`Statutory document "${req}" was rejected or verification failed.`);
      } else if (isPending) {
        unverified.push(req);
      } else if (isUploadedOnly) {
        uploaded.push(req);
        unverified.push(req);
      } else {
        missing.push(req);
      }
    }
  }

  const isBlocking =
    (inst.status === 'in_progress' || inst.status === 'pending_approval') &&
    (missing.length > 0 || failed.length > 0);

  const allSatisfied = requiredDocs.length > 0 && verified.length === requiredDocs.length;

  return {
    stage_id: stage.id,
    stage_code: stage.code,
    stage_instance_id: inst.id,
    stage_title: stage.title,
    stage_number: stage.stage_number,
    stage_status: inst.status,
    has_requirements: true,
    required_documents: requiredDocs,
    missing_documents: missing,
    uploaded_documents: uploaded,
    unverified_documents: unverified,
    failed_documents: failed,
    verified_documents: verified,
    is_blocking: isBlocking,
    blocking_reasons: blockingReasons,
    all_satisfied: allSatisfied,
  };
}

/**
 * Deterministically evaluates whether required statutory documents for workflow stages
 * are present, missing, or awaiting officer validation.
 * Zero fabrication: strictly compares stage configuration against recorded document vault.
 */
export function detectMissingStageDocuments(params: {
  stages: WorkflowStage[];
  stageInstances: CaseStageInstance[];
  documents?: CaseDocument[];
  includeAllStages?: boolean;
}): MissingDocumentReport[] {
  const { stages, stageInstances, documents = [], includeAllStages = false } = params;
  const stageMap = new Map<string, WorkflowStage>();
  stages.forEach((s) => stageMap.set(s.id, s));

  const reports: MissingDocumentReport[] = [];

  for (const inst of stageInstances) {
    const stageMeta = stageMap.get(inst.stage_id);
    if (!stageMeta) continue;

    const evalResult = detectMissingStageDocumentsForStage({
      stage: stageMeta,
      stageInstance: inst,
      documents,
    });

    if (!evalResult.has_requirements && !includeAllStages) {
      continue;
    }

    if (
      includeAllStages ||
      evalResult.missing_documents.length > 0 ||
      evalResult.unverified_documents.length > 0 ||
      evalResult.failed_documents.length > 0
    ) {
      reports.push({
        stage_id: evalResult.stage_id,
        stage_code: evalResult.stage_code,
        stage_instance_id: evalResult.stage_instance_id,
        stage_title: evalResult.stage_title,
        stage_number: evalResult.stage_number,
        stage_status: evalResult.stage_status,
        required_documents: evalResult.required_documents,
        missing_documents: evalResult.missing_documents,
        unverified_documents: evalResult.unverified_documents,
        failed_documents: evalResult.failed_documents,
        verified_documents: evalResult.verified_documents,
        is_blocking: evalResult.is_blocking,
      });
    }
  }

  return reports;
}
