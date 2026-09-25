import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { CaseEvent } from '../../shared/types';

// In-memory audit log store for offline resilience and automated testing
const inMemoryAuditLogs: CaseEvent[] = [];

export async function logCaseEvent(params: {
  case_id?: string | null;
  project_id?: string | null;
  stage_instance_id?: string | null;
  event_type: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  actor_id?: string | null;
  actor_name?: string;
}): Promise<CaseEvent | null> {
  const localEvent: CaseEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    case_id: params.case_id || null,
    project_id: params.project_id || null,
    stage_instance_id: params.stage_instance_id || null,
    event_type: params.event_type,
    title: params.title,
    description: params.description || '',
    metadata: params.metadata || {},
    actor_id: params.actor_id || undefined,
    actor_name: params.actor_name || 'System Operator',
    created_at: new Date().toISOString(),
  };

  inMemoryAuditLogs.push(localEvent);

  if (!isSupabaseConfigured) {
    return localEvent;
  }

  try {
    const supabase = getSupabase();
    const insertPayload: any = {
      event_type: params.event_type,
      title: params.title,
      description: params.description || '',
      metadata: params.metadata || {},
      actor_id: params.actor_id || null,
      actor_name: params.actor_name || 'System Operator',
    };

    if (params.case_id) insertPayload.case_id = params.case_id;
    if (params.project_id) insertPayload.project_id = params.project_id;
    if (params.stage_instance_id) insertPayload.stage_instance_id = params.stage_instance_id;

    const { data, error } = await supabase
      .from('case_events')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.warn('[AuditLogger] Supabase DB insert error (event retained in memory):', error.message);
      return localEvent;
    }

    return data as CaseEvent;
  } catch (err: any) {
    console.warn('[AuditLogger] Unexpected logging exception (event retained in memory):', err.message);
    return localEvent;
  }
}

/**
 * Retrieve recent audit events from memory (for testing or offline evaluation).
 */
export function getRecentAuditLogs(filter?: {
  case_id?: string;
  project_id?: string;
  event_type?: string;
}): CaseEvent[] {
  let logs = [...inMemoryAuditLogs];
  if (filter?.case_id) logs = logs.filter((l) => l.case_id === filter.case_id);
  if (filter?.project_id) logs = logs.filter((l) => l.project_id === filter.project_id);
  if (filter?.event_type) logs = logs.filter((l) => l.event_type === filter.event_type);
  return logs;
}

export function clearInMemoryAuditLogs(): void {
  inMemoryAuditLogs.length = 0;
}
