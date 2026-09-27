import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  fetchGeographyStatus,
  getGeographyProvenance,
  getGeographySource,
  geographySourceHint,
  subscribeGeographySource,
  GeographySource,
  GeographyProvenance,
} from '../../lib/api';
import { Badge } from './Badge';

/**
 * The one place that describes where administrative geography came from.
 *
 * Every surface that offers a state / district / sub-district / village choice
 * renders this instead of inventing its own wording, so the UI can never end up
 * with one screen calling the hierarchy "authoritative" while another already
 * knows the source was never ingested. The badge only ever says
 * "Authoritative LGD" when the *server* reported `authoritative: true` — a
 * reference or absent source is always labelled as such.
 */
export interface GeographySourceNoteProps {
  /** `badge` = inline chip for headers, `banner` = explanatory strip. */
  variant?: 'badge' | 'banner';
  className?: string;
}

export const GeographySourceNote: React.FC<GeographySourceNoteProps> = ({
  variant = 'banner',
  className = '',
}) => {
  const [source, setSource] = useState<GeographySource>(getGeographySource());
  const [provenance, setProvenance] = useState<GeographyProvenance | null>(
    getGeographyProvenance()
  );

  useEffect(
    () =>
      subscribeGeographySource(() => {
        setSource(getGeographySource());
        setProvenance(getGeographyProvenance());
      }),
    []
  );

  // Runs once per mount; a failed probe leaves the last known (honest) state.
  useEffect(() => {
    let mounted = true;
    fetchGeographyStatus()
      .then((p) => {
        if (mounted) setProvenance(p);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // The badge only ever claims LGD authority when the server said so; rows from
  // the temporary reference mirror get an explicit non-authoritative label.
  const badgeText =
    source === 'authoritative'
      ? 'Authoritative LGD'
      : provenance?.status === 'temporary_reference'
        ? 'Temporary reference — not LGD'
        : provenance?.status === 'mixed'
          ? 'Mixed geography sources'
          : 'LGD unavailable';

  if (variant === 'badge') {
    return (
      <Badge variant={source === 'authoritative' ? 'emerald' : 'amber'} className={className}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            source === 'authoritative' ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        {badgeText}
      </Badge>
    );
  }

  const authoritative = source === 'authoritative';
  const counts = provenance?.counts;

  return (
    <div
      role="status"
      className={`flex items-start gap-1.5 rounded-md border px-3 py-2 text-xs ${
        authoritative
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      } ${className}`}
    >
      {authoritative ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <span>
        {authoritative ? (
          <>
            Authoritative LGD hierarchy loaded from the database
            {counts
              ? ` — ${counts.states} states/UTs, ${counts.districts} districts, ${counts.sub_districts} sub-districts, ${counts.villages} villages.`
              : '.'}
          </>
        ) : (
          geographySourceHint(provenance)
        )}
      </span>
    </div>
  );
};

export default GeographySourceNote;
