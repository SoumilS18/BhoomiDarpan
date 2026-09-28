-- ============================================================================
-- BhoomiDarpan - Migration 000002: Day 2 GIS & Document Intelligence Extensions
-- ============================================================================

-- 1. Expand document_status enum values safely
DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'processed';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'validation_required';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null;
END $$;

-- 2. Add storage_path and error_details to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS storage_path TEXT,
ADD COLUMN IF NOT EXISTS error_details TEXT;

-- 3. Add human validation tracking fields to document_extractions table
ALTER TABLE document_extractions
ADD COLUMN IF NOT EXISTS human_edited_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS validation_notes TEXT,
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending';

-- 4. Additional indexes for spatial parcel queries and document lookups
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_stage ON documents(stage_instance_id);
CREATE INDEX IF NOT EXISTS idx_extractions_document ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(acquisition_status);
