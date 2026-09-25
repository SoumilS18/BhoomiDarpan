import React from 'react';
import { StageInstanceStatus } from '../../../shared/types';
import { Badge } from '../common/Badge';
import { CheckCircle2, Clock, AlertTriangle, PauseCircle, ShieldAlert } from 'lucide-react';

interface StageProgressBadgeProps {
  status: StageInstanceStatus;
  isOverdue?: boolean;
}

export const StageProgressBadge: React.FC<StageProgressBadgeProps> = ({ status, isOverdue }) => {
  if (isOverdue && status !== 'completed') {
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
          <span>Completed</span>
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="navy">
          <Clock className="h-3 w-3 mr-1 animate-spin" />
          <span>In Progress</span>
        </Badge>
      );
    case 'pending_approval':
      return (
        <Badge variant="purple">
          <PauseCircle className="h-3 w-3 mr-1" />
          <span>Pending Approval</span>
        </Badge>
      );
    case 'blocked':
      return (
        <Badge variant="red">
          <ShieldAlert className="h-3 w-3 mr-1" />
          <span>Blocked</span>
        </Badge>
      );
    case 'not_started':
    default:
      return (
        <Badge variant="slate">
          <span>Not Started</span>
        </Badge>
      );
  }
};
