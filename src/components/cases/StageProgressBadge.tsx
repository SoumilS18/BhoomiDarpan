import React from 'react';
import { StageInstanceStatus } from '../../../shared/types';
import { STAGE_STATUS_LABELS, stageStatusLabel } from '../../lib/domainLabels';
import { Badge } from '../common/Badge';
import { CheckCircle2, Clock, AlertTriangle, PauseCircle, ShieldAlert, SkipForward } from 'lucide-react';

interface StageProgressBadgeProps {
  status: StageInstanceStatus;
  isOverdue?: boolean;
}

/**
 * Renders a workflow stage's status.
 *
 * Every branch corresponds to a real `StageInstanceStatus` member (the switch
 * is exhaustive via `STAGE_STATUS_LABELS`), so no backend status can be
 * silently displayed as something it is not — `skipped` in particular must not
 * fall through to "Not Started".
 */
export const StageProgressBadge: React.FC<StageProgressBadgeProps> = ({ status, isOverdue }) => {
  // A skipped stage has no deadline, so it can never be overdue.
  if (isOverdue && status !== 'completed' && status !== 'skipped') {
    return (
      <Badge variant="red" pulse>
        <AlertTriangle className="h-3 w-3 mr-1" />
        <span>Overdue</span>
      </Badge>
    );
  }

  switch (status) {
    case 'completed':
      return (
        <Badge variant="emerald">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          <span>{STAGE_STATUS_LABELS.completed}</span>
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="navy">
          <Clock className="h-3 w-3 mr-1 animate-spin" />
          <span>{STAGE_STATUS_LABELS.in_progress}</span>
        </Badge>
      );
    case 'pending_approval':
      return (
        <Badge variant="purple">
          <PauseCircle className="h-3 w-3 mr-1" />
          <span>{STAGE_STATUS_LABELS.pending_approval}</span>
        </Badge>
      );
    case 'blocked':
      return (
        <Badge variant="red">
          <ShieldAlert className="h-3 w-3 mr-1" />
          <span>{STAGE_STATUS_LABELS.blocked}</span>
        </Badge>
      );
    case 'skipped':
      return (
        <Badge variant="slate">
          <SkipForward className="h-3 w-3 mr-1" />
          <span>{STAGE_STATUS_LABELS.skipped}</span>
        </Badge>
      );
    case 'not_started':
    default:
      return <Badge variant="slate">{stageStatusLabel(status)}</Badge>;
  }
};
