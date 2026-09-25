import { useEffect } from 'react';
import { supabase, isClientSupabaseConfigured } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeCallback = (payload: any) => void;

interface ChannelSubscription {
  channel: RealtimeChannel;
  subscribers: Set<RealtimeCallback>;
}

// Active channels mapped by unique topic key to prevent duplicate subscriptions
const activeChannels = new Map<string, ChannelSubscription>();

/**
 * Subscribes to case updates (case attributes, stages, documents) with reference-counted lifecycle.
 */
export function subscribeToCaseEvents(caseId: string, callback: RealtimeCallback): () => void {
  if (!isClientSupabaseConfigured || !supabase || !caseId) {
    return () => {};
  }

  const topicKey = `case:${caseId}`;
  let sub = activeChannels.get(topicKey);

  if (!sub) {
    const channel = supabase
      .channel(topicKey)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acquisition_cases', filter: `id=eq.${caseId}` },
        (payload) => {
          sub?.subscribers.forEach((cb) => cb({ type: 'CASE_UPDATE', payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_stage_instances', filter: `case_id=eq.${caseId}` },
        (payload) => {
          sub?.subscribers.forEach((cb) => cb({ type: 'STAGE_UPDATE', payload }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `case_id=eq.${caseId}` },
        (payload) => {
          sub?.subscribers.forEach((cb) => cb({ type: 'DOCUMENT_UPDATE', payload }));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to channel ${topicKey}`);
        }
      });

    sub = {
      channel,
      subscribers: new Set(),
    };
    activeChannels.set(topicKey, sub);
  }

  sub.subscribers.add(callback);

  // Return teardown function
  return () => {
    sub?.subscribers.delete(callback);
    if (sub && sub.subscribers.size === 0) {
      console.log(`[Realtime] Tearing down empty channel ${topicKey}`);
      supabase?.removeChannel(sub.channel);
      activeChannels.delete(topicKey);
    }
  };
}

/**
 * Subscribes to real-time notification alerts with reference-counted lifecycle.
 */
export function subscribeToSystemNotifications(callback: RealtimeCallback): () => void {
  if (!isClientSupabaseConfigured || !supabase) {
    return () => {};
  }

  const topicKey = 'system:notifications';
  let sub = activeChannels.get(topicKey);

  if (!sub) {
    const channel = supabase
      .channel(topicKey)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'case_notifications' },
        (payload) => {
          sub?.subscribers.forEach((cb) => cb({ type: 'NEW_NOTIFICATION', payload }));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${topicKey}`);
        }
      });

    sub = {
      channel,
      subscribers: new Set(),
    };
    activeChannels.set(topicKey, sub);
  }

  sub.subscribers.add(callback);

  return () => {
    sub?.subscribers.delete(callback);
    if (sub && sub.subscribers.size === 0) {
      supabase?.removeChannel(sub.channel);
      activeChannels.delete(topicKey);
    }
  };
}

/**
 * React hook to listen for case realtime updates safely with cleanup on unmount.
 */
export function useCaseRealtime(caseId: string | null | undefined, onUpdate: (event: any) => void) {
  useEffect(() => {
    if (!caseId) return;
    const unsubscribe = subscribeToCaseEvents(caseId, onUpdate);
    return () => unsubscribe();
  }, [caseId, onUpdate]);
}

/**
 * React hook to listen for real-time notifications with cleanup on unmount.
 */
export function useNotificationsRealtime(onNotification: (event: any) => void) {
  useEffect(() => {
    const unsubscribe = subscribeToSystemNotifications(onNotification);
    return () => unsubscribe();
  }, [onNotification]);
}

// ============================================================================
// DAY 2: REALTIME STREAM MODES & SOURCE SYNC SUBSCRIPTION
// ============================================================================

export type DataStreamMode =
  | 'REALTIME_INTERNAL_EVENT' // Genuine PostgreSQL change event via websocket
  | 'EXTERNAL_DATA_REFRESH'   // Triggered manual or scheduled external API pull
  | 'CACHED_DATA';            // Loaded from persisted database/memory cache

/**
 * Subscribes to data sources registry updates (sync status, last_successful_sync, errors).
 */
export function subscribeToSourceSyncEvents(callback: RealtimeCallback): () => void {
  if (!isClientSupabaseConfigured || !supabase) {
    return () => {};
  }

  const topicKey = 'system:data_sources';
  let sub = activeChannels.get(topicKey);

  if (!sub) {
    const channel = supabase
      .channel(topicKey)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_sources' },
        (payload) => {
          sub?.subscribers.forEach((cb) => cb({ type: 'SOURCE_SYNC_UPDATE', payload }));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${topicKey}`);
        }
      });

    sub = {
      channel,
      subscribers: new Set(),
    };
    activeChannels.set(topicKey, sub);
  }

  sub.subscribers.add(callback);

  return () => {
    sub?.subscribers.delete(callback);
    if (sub && sub.subscribers.size === 0) {
      supabase?.removeChannel(sub.channel);
      activeChannels.delete(topicKey);
    }
  };
}

/**
 * React hook to listen for data source sync updates with cleanup on unmount.
 */
export function useSourceSyncRealtime(onSyncUpdate: (event: any) => void) {
  useEffect(() => {
    const unsubscribe = subscribeToSourceSyncEvents(onSyncUpdate);
    return () => unsubscribe();
  }, [onSyncUpdate]);
}

