import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Building,
  MapPin,
  Mail,
  Phone,
  FileText,
  KeyRound,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  UserX,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { AccessRequest, UserRole } from '../../../shared/types';
import { fetchAccessRequests, approveAccessRequest, rejectAccessRequest } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/domainLabels';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

const ALL_ROLES: UserRole[] = [
  'lao',
  'project_officer',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'admin',
  'viewer',
];

export const AccessRequestsManager: React.FC = () => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Approval Modal State
  const [approvingRequest, setApprovingRequest] = useState<AccessRequest | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('viewer');
  const [tempPassword, setTempPassword] = useState<string>('');
  const [reviewNote, setReviewNote] = useState<string>('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState<boolean>(false);
  const [approvalResult, setApprovalResult] = useState<{
    email: string;
    temporaryPassword?: string;
    role: string;
    message: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState<boolean>(false);

  // Rejection Modal State
  const [rejectingRequest, setRejectingRequest] = useState<AccessRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmittingRejection, setIsSubmittingRejection] = useState<boolean>(false);

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${pass}@Bhoomi1`;
  };

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAccessRequests();
      setRequests(res.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load access requests.');
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleOpenApproveModal = (req: AccessRequest) => {
    setApprovingRequest(req);
    setSelectedRole((req.requested_role as UserRole) || 'viewer');
    setTempPassword(generateRandomPassword());
    setReviewNote(`Approved for ${req.full_name} (${req.organization})`);
    setApprovalResult(null);
    setCopiedCredentials(false);
  };

  const handleConfirmApproval = async () => {
    if (!approvingRequest) return;
    setIsSubmittingApproval(true);
    try {
      const res = await approveAccessRequest(approvingRequest.id, {
        role: selectedRole,
        temporaryPassword: tempPassword,
        reviewNote,
      });
      setApprovalResult({
        email: approvingRequest.email,
        temporaryPassword: res.credentials?.temporaryPassword || tempPassword,
        role: res.credentials?.role || selectedRole,
        message: res.message,
      });
      await loadRequests();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleOpenRejectModal = (req: AccessRequest) => {
    setRejectingRequest(req);
    setRejectionReason('Does not meet jurisdiction or institutional verification criteria.');
  };

  const handleConfirmRejection = async () => {
    if (!rejectingRequest) return;
    setIsSubmittingRejection(true);
    try {
      await rejectAccessRequest(rejectingRequest.id, {
        reviewNote: rejectionReason,
      });
      setRejectingRequest(null);
      await loadRequests();
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  // Filtered & Searched requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = req.full_name?.toLowerCase().includes(q);
        const matchesEmail = req.email?.toLowerCase().includes(q);
        const matchesOrg = req.organization?.toLowerCase().includes(q);
        const matchesDept = req.department?.toLowerCase().includes(q);
        const matchesState = req.jurisdiction_state_name?.toLowerCase().includes(q);
        const matchesDistrict = req.jurisdiction_district_name?.toLowerCase().includes(q);
        return (
          matchesName ||
          matchesEmail ||
          matchesOrg ||
          matchesDept ||
          matchesState ||
          matchesDistrict
        );
      }
      return true;
    });
  }, [requests, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    };
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Top Banner with Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pending Review
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">{counts.pending}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Approved &amp; Active
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{counts.approved}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Declined
            </p>
            <p className="text-2xl font-bold text-slate-600 mt-0.5">{counts.rejected}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-slate-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Submissions
            </p>
            <p className="text-2xl font-bold text-gov-slate mt-0.5">{counts.all}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
            <UserCheck className="h-5 w-5 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Status Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5',
              statusFilter === 'pending'
                ? 'bg-white text-gov-slate shadow-xs'
                : 'text-slate-600 hover:text-gov-slate'
            )}
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>Pending Review</span>
            {counts.pending > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {counts.pending}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5',
              statusFilter === 'approved'
                ? 'bg-white text-gov-slate shadow-xs'
                : 'text-slate-600 hover:text-gov-slate'
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Approved</span>
            <span className="text-[10px] text-slate-400">({counts.approved})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('rejected')}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5',
              statusFilter === 'rejected'
                ? 'bg-white text-gov-slate shadow-xs'
                : 'text-slate-600 hover:text-gov-slate'
            )}
          >
            <XCircle className="h-3.5 w-3.5 text-slate-500" />
            <span>Declined</span>
            <span className="text-[10px] text-slate-400">({counts.rejected})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
              statusFilter === 'all'
                ? 'bg-white text-gov-slate shadow-xs'
                : 'text-slate-600 hover:text-gov-slate'
            )}
          >
            All Submissions
          </button>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, district..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gov-navy focus:bg-white"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadRequests}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <RefreshCw className="h-6 w-6 text-gov-navy animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading access requests...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredRequests.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <UserCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gov-slate">No access requests found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            {statusFilter === 'pending'
              ? 'There are currently no pending access requests waiting for review.'
              : 'No access requests match the current filter or search criteria.'}
          </p>
        </div>
      )}

      {/* Requests Table / Cards */}
      {!isLoading && filteredRequests.length > 0 && (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const isExpanded = expandedId === req.id;
            return (
              <div
                key={req.id}
                className={clsx(
                  'bg-white rounded-xl border transition-all shadow-xs overflow-hidden',
                  req.status === 'pending'
                    ? 'border-amber-200/80 bg-amber-50/10'
                    : req.status === 'approved'
                    ? 'border-slate-200'
                    : 'border-slate-200 opacity-80'
                )}
              >
                <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  {/* Left: Applicant Overview */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-gov-slate">{req.full_name}</span>
                      {req.requested_role && (
                        <Badge variant="navy">
                          Requested: {ROLE_LABELS[req.requested_role] || req.requested_role}
                        </Badge>
                      )}
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="h-3 w-3" /> Approved &amp; Account Created
                        </span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          <XCircle className="h-3 w-3" /> Declined
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono">{req.email}</span>
                      </span>
                      {req.contact_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{req.contact_phone}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Building className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {req.organization}
                          {req.designation ? ` (${req.designation})` : ''}
                        </span>
                      </span>
                      {(req.jurisdiction_state_name || req.jurisdiction_district_name) && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <MapPin className="h-3.5 w-3.5 text-blue-500" />
                          <span>
                            {req.jurisdiction_district_name
                              ? `${req.jurisdiction_district_name}, `
                              : ''}
                            {req.jurisdiction_state_name || 'National'}
                            {req.jurisdiction_district_lgd_code
                              ? ` (LGD: ${req.jurisdiction_district_lgd_code})`
                              : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions & Expand */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {req.status === 'pending' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRejectModal(req)}
                          className="text-xs text-slate-600 hover:text-red-600 hover:border-red-300"
                        >
                          <XCircle className="h-3.5 w-3.5 text-slate-500 mr-1" />
                          Decline
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenApproveModal(req)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Review &amp; Approve
                        </Button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="p-1.5 text-slate-400 hover:text-gov-slate hover:bg-slate-100 rounded-lg transition-all"
                      title={isExpanded ? 'Collapse details' : 'Expand details'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5 text-xs space-y-3">
                    <div>
                      <span className="font-semibold text-slate-700 block mb-1">
                        Application Justification &amp; Purpose:
                      </span>
                      <p className="bg-white border border-slate-200 p-3 rounded-lg text-slate-700 leading-relaxed">
                        {req.justification}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Submitted On
                        </span>
                        <span>{new Date(req.created_at).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Department
                        </span>
                        <span>{req.department || 'Not specified'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          State / District LGD
                        </span>
                        <span>
                          State LGD: {req.jurisdiction_state_lgd_code || 'None'} | District LGD:{' '}
                          {req.jurisdiction_district_lgd_code || 'None'}
                        </span>
                      </div>
                    </div>

                    {req.review_note && (
                      <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-lg text-blue-900">
                        <span className="font-bold block text-[11px] text-blue-950">
                          Administrative Review Note:
                        </span>
                        <p className="mt-0.5">{req.review_note}</p>
                        {req.reviewed_at && (
                          <span className="text-[10px] text-blue-600 block mt-1">
                            Reviewed on {new Date(req.reviewed_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* APPROVAL MODAL */}
      {approvingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-emerald-600 text-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  <h3 className="font-bold text-base">Approve &amp; Provision Account</h3>
                </div>
                {!approvalResult && (
                  <button
                    type="button"
                    onClick={() => setApprovingRequest(null)}
                    className="text-white/80 hover:text-white text-lg font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-xs text-emerald-100 mt-1">
                Authorises platform access and provisions a genuine Supabase Auth user.
              </p>
            </div>

            {/* If Approval Succeeded */}
            {approvalResult ? (
              <div className="p-6 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold text-sm block text-emerald-950">
                      Account Successfully Provisioned!
                    </strong>
                    <p className="mt-1">{approvalResult.message}</p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="font-bold text-gov-slate">Officer Login Credentials</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `BhoomiDarpan Account Credentials:\nEmail: ${approvalResult.email}\nTemporary Password: ${approvalResult.temporaryPassword}\nAssigned Role: ${approvalResult.role}`
                        )
                      }
                      className="text-[11px] h-7 flex items-center gap-1"
                    >
                      {copiedCredentials ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Info</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1">
                    <span className="text-slate-500 font-medium">Email:</span>
                    <span className="col-span-2 font-mono font-bold text-gov-slate">
                      {approvalResult.email}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1">
                    <span className="text-slate-500 font-medium">Temporary Password:</span>
                    <span className="col-span-2 font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                      {approvalResult.temporaryPassword}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1">
                    <span className="text-slate-500 font-medium">Assigned Role:</span>
                    <span className="col-span-2 font-semibold text-gov-slate">
                      {ROLE_LABELS[approvalResult.role as UserRole] || approvalResult.role}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setApprovingRequest(null);
                      setApprovalResult(null);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              /* Approval Form */
              <div className="p-6 space-y-4 text-xs">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Applicant:</span>
                    <strong className="text-gov-slate">{approvingRequest.full_name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Email:</span>
                    <span className="font-mono text-gov-slate">{approvingRequest.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Organization:</span>
                    <span className="text-gov-slate">{approvingRequest.organization}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Territory:</span>
                    <span className="text-gov-slate">
                      {approvingRequest.jurisdiction_district_name
                        ? `${approvingRequest.jurisdiction_district_name}, `
                        : ''}
                      {approvingRequest.jurisdiction_state_name || 'National Scope'}
                    </span>
                  </div>
                </div>

                {/* Role Selector */}
                <div>
                  <label className="block font-bold text-gov-slate mb-1">
                    Assigned Platform Role:
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-gov-navy font-medium"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]} ({r})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Administrator authority allows granting any operational or administrative role.
                  </p>
                </div>

                {/* Initial Temporary Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-gov-slate">Initial Temporary Password:</label>
                    <button
                      type="button"
                      onClick={() => setTempPassword(generateRandomPassword())}
                      className="text-[11px] text-gov-navy hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" /> Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    className="w-full font-mono bg-white border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-gov-navy"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The officer can sign in with this password immediately.
                  </p>
                </div>

                {/* Review Note */}
                <div>
                  <label className="block font-bold text-gov-slate mb-1">
                    Review / Approval Note (Internal):
                  </label>
                  <input
                    type="text"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="e.g., Verified credentials from Land Revenue Department"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-gov-navy"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <Button
                    variant="outline"
                    onClick={() => setApprovingRequest(null)}
                    disabled={isSubmittingApproval}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmApproval}
                    disabled={isSubmittingApproval}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"
                  >
                    {isSubmittingApproval && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>Confirm &amp; Provision User</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-800 text-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserX className="h-5 w-5 text-red-400" />
                  <h3 className="font-bold text-base">Decline Access Request</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="text-white/80 hover:text-white text-lg font-bold"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Decline access request for {rejectingRequest.full_name} ({rejectingRequest.email}).
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gov-slate mb-1">
                  Reason for Declining:
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-gov-navy"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => setRejectingRequest(null)}
                  disabled={isSubmittingRejection}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmRejection}
                  disabled={isSubmittingRejection}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
                >
                  {isSubmittingRejection && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Decline Request</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
