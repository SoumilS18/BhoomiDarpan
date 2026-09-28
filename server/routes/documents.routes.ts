import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { extractDocumentIntelligence } from '../services/documentExtractor';
import { logCaseEvent } from '../services/auditLogger';
import { DocumentStatus } from '../../shared/types';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { addVaultDocument } from '../services/vaultService';

const router = Router();

// Configure multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// Ensure local uploads directory exists for offline/local storage fallback
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// POST /api/cases/:id/documents - Upload document and record metadata
router.post('/cases/:id/documents', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'revenue_inspector']), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId } = req.params;
    const file = req.file;
    const { title, document_type, stage_instance_id, actorName } = req.body;

    if (!title || !document_type) {
      return res.status(400).json({ error: 'title and document_type are required' });
    }

    const supabase = getSupabase();

    // Verify case exists
    const { data: caseItem, error: caseErr } = await supabase
      .from('acquisition_cases')
      .select('id, case_number, title')
      .eq('id', caseId)
      .single();

    if (caseErr || !caseItem) {
      return res.status(404).json({ error: 'Acquisition case not found' });
    }

    let fileUrl = '';
    let storagePath = '';
    const fileSizeBytes = file ? file.size : 0;
    const mimeType = file ? file.mimetype : 'text/plain';

    if (file) {
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      storagePath = `cases/${caseId}/${Date.now()}_${sanitizedName}`;

      // Attempt Supabase Storage upload
      try {
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadErr) {
          console.warn('[Storage] Supabase storage upload warning (using local fallback):', uploadErr.message);
          // Local fallback
          const localFilePath = path.join(UPLOADS_DIR, `${Date.now()}_${sanitizedName}`);
          fs.writeFileSync(localFilePath, file.buffer);
          fileUrl = `/api/documents/files/${path.basename(localFilePath)}`;
        } else if (uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);
          fileUrl = publicUrlData.publicUrl;
        }
      } catch (storageException: any) {
        console.warn('[Storage] Storage fallback to local:', storageException.message);
        const localFilePath = path.join(UPLOADS_DIR, `${Date.now()}_${sanitizedName}`);
        fs.writeFileSync(localFilePath, file.buffer);
        fileUrl = `/api/documents/files/${path.basename(localFilePath)}`;
      }
    } else {
      fileUrl = req.body.file_url || '';
    }

    // Insert document record with deterministic metadata
    const { data: docRecord, error: docError } = await supabase
      .from('documents')
      .insert({
        case_id: caseId,
        stage_instance_id: stage_instance_id || null,
        title,
        document_type,
        file_url: fileUrl,
        storage_path: storagePath || null,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
        status: 'uploaded' as DocumentStatus,
      })
      .select('*')
      .single();

    if (docError) {
      return res.status(500).json({ error: `Failed to record document metadata: ${docError.message}` });
    }

    // Log immutable audit event
    await logCaseEvent({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      stage_instance_id: stage_instance_id || undefined,
      event_type: 'DOCUMENT_UPLOADED',
      title: `Document Uploaded: ${title}`,
      description: `Uploaded document type: ${document_type} (${(fileSizeBytes / 1024).toFixed(1)} KB). Status: uploaded.`,
      actor_name: actorName || 'Officer',
      metadata: {
        document_id: docRecord.id,
        document_type,
        mime_type: mimeType,
        file_size_bytes: fileSizeBytes,
      },
    });

    // Also index into Document Vault
    await addVaultDocument({
      case_id: typeof caseId === 'string' ? caseId : (caseId as any)[0],
      title,
      category: (document_type.toLowerCase().includes('gazette')
        ? 'gazette_notification'
        : document_type.toLowerCase().includes('7_12') || document_type.toLowerCase().includes('land')
        ? 'land_record_7_12'
        : document_type.toLowerCase().includes('sia')
        ? 'sia_report'
        : document_type.toLowerCase().includes('court')
        ? 'court_order'
        : document_type.toLowerCase().includes('rr') || document_type.toLowerCase().includes('rehab')
        ? 'rr_scheme'
        : 'valuation_certificate') as any,
      file_name: req.file?.originalname || `${title}.pdf`,
      file_size_bytes: fileSizeBytes,
      mime_type: mimeType,
      storage_url: fileUrl,
      uploaded_by: actorName || 'Officer',
    });

    res.status(201).json({ document: docRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/cases/:id/documents - Get all documents for a case
router.get('/cases/:id/documents', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: caseId } = req.params;
    const supabase = getSupabase();

    const { data: docs, error } = await supabase
      .from('documents')
      .select(`
        *,
        extractions:document_extractions(*)
      `)
      .eq('case_id', caseId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ documents: docs || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/process - Trigger server-side Gemini extraction
router.post('/documents/:id/process', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: documentId } = req.params;
    const { rawContentText } = req.body; // Optional direct text content if plain text notice
    const supabase = getSupabase();

    // 1. Fetch document record
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Set document status to 'processing'
    await supabase
      .from('documents')
      .update({ status: 'processing', error_details: null })
      .eq('id', documentId);

    // 2. Fetch file buffer if stored locally or in Supabase storage
    let fileBuffer: Buffer | undefined;
    if (doc.storage_path) {
      try {
        const { data: downloadedBlob } = await supabase.storage
          .from('documents')
          .download(doc.storage_path);
        if (downloadedBlob) {
          const arrayBuf = await downloadedBlob.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuf);
        }
      } catch (dlErr: any) {
        console.warn('[Storage] Could not download from remote bucket:', dlErr.message);
      }
    }

    // 3. Trigger server-side Gemini extraction
    const extractionResult = await extractDocumentIntelligence({
      documentTitle: doc.title,
      mimeType: doc.mime_type || 'text/plain',
      textContent: rawContentText || undefined,
      fileBuffer,
    });

    if (!extractionResult.success) {
      // Record failure without corrupting or deleting document
      await supabase
        .from('documents')
        .update({
          status: 'failed',
          error_details: extractionResult.error || 'Extraction failed',
        })
        .eq('id', documentId);

      await logCaseEvent({
        case_id: doc.case_id,
        stage_instance_id: doc.stage_instance_id,
        event_type: 'DOCUMENT_EXTRACTION_FAILED',
        title: `AI Extraction Failed: ${doc.title}`,
        description: extractionResult.error || 'Server-side extraction failed.',
        actor_name: 'Document Intelligence Service',
        metadata: { document_id: documentId },
      });

      return res.status(422).json({
        success: false,
        status: 'failed',
        error: extractionResult.error,
        message: 'Extraction could not be completed. Document is preserved safely. Manual entry or retry available.',
      });
    }

    // 4. Success: Save structured extraction
    const { data: extractionRecord, error: extractErr } = await supabase
      .from('document_extractions')
      .insert({
        document_id: documentId,
        raw_text: extractionResult.rawText || '',
        structured_data: extractionResult.structuredData || {},
        confidence_score: extractionResult.confidenceScore || 0.8,
        validation_status: 'pending',
        is_verified: false,
      })
      .select('*')
      .single();

    if (extractErr) {
      await supabase
        .from('documents')
        .update({ status: 'failed', error_details: extractErr.message })
        .eq('id', documentId);
      return res.status(500).json({ error: `Failed to save extraction: ${extractErr.message}` });
    }

    // Update document status to 'validation_required'
    await supabase
      .from('documents')
      .update({ status: 'validation_required', error_details: null })
      .eq('id', documentId);

    // Audit log
    await logCaseEvent({
      case_id: doc.case_id,
      stage_instance_id: doc.stage_instance_id,
      event_type: 'DOCUMENT_EXTRACTED',
      title: `AI Extraction Completed: ${doc.title}`,
      description: `Structured legal fields extracted (Confidence: ${Math.round(
        (extractionResult.confidenceScore || 0.8) * 100
      )}%). Awaiting human validation.`,
      actor_name: 'Document Intelligence Engine',
      metadata: {
        document_id: documentId,
        extraction_id: extractionRecord.id,
        confidence: extractionResult.confidenceScore,
      },
    });

    res.json({
      success: true,
      document_status: 'validation_required',
      extraction: extractionRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/validate - Human validation (accept/edit/reject)
router.post('/documents/:id/validate', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'approver']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: documentId } = req.params;
    const { validation_status, human_edited_data, validation_notes, actorName } = req.body;

    if (!validation_status || !['accepted', 'edited', 'rejected'].includes(validation_status)) {
      return res.status(400).json({ error: 'validation_status must be "accepted", "edited", or "rejected"' });
    }

    const supabase = getSupabase();

    // Fetch document & latest extraction
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { data: extraction } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!extraction) {
      return res.status(404).json({ error: 'No extraction record found for this document' });
    }

    const isVerified = validation_status === 'accepted' || validation_status === 'edited';
    const newDocStatus: DocumentStatus = isVerified ? 'verified' : 'rejected';

    // Update extraction while strictly preserving original raw_text and structured_data
    const { data: updatedExtraction, error: updateErr } = await supabase
      .from('document_extractions')
      .update({
        is_verified: isVerified,
        validation_status,
        human_edited_data: validation_status === 'edited' ? human_edited_data : null,
        validation_notes: validation_notes || null,
        verified_at: new Date().toISOString(),
      })
      .eq('id', extraction.id)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message });
    }

    // Update document status
    await supabase
      .from('documents')
      .update({ status: newDocStatus })
      .eq('id', documentId);

    // Audit log
    await logCaseEvent({
      case_id: doc.case_id,
      stage_instance_id: doc.stage_instance_id,
      event_type: 'DOCUMENT_VALIDATED',
      title: `Document ${isVerified ? 'Verified' : 'Rejected'}: ${doc.title}`,
      description: `Validation decision: ${validation_status.toUpperCase()} by ${actorName || 'Authorized Officer'}. ${
        validation_notes ? `Notes: ${validation_notes}` : ''
      }`,
      actor_name: actorName || 'Authorized Officer',
      metadata: {
        document_id: documentId,
        extraction_id: extraction.id,
        validation_status,
        has_edits: Boolean(human_edited_data),
      },
    });

    res.json({
      success: true,
      document_status: newDocStatus,
      extraction: updatedExtraction,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/files/:filename - Serve locally uploaded files
// Serves raw uploaded bytes. Unauthenticated by design would let anyone who
// can guess a filename read case documents, so the session is checked first;
// the client never links here directly (it fetches with `getAuthHeaders`).
router.get('/documents/files/:filename', requireAuth, (req: Request, res: Response) => {
  const rawParam = req.params.filename;
  const filename = path.basename(typeof rawParam === 'string' ? rawParam : (rawParam as any)[0]);
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

export default router;
