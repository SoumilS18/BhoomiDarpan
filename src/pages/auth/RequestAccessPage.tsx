import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Send, ShieldCheck } from 'lucide-react';
import { AuthShell, AuthField } from '../../components/layout/auth/AuthShell';
import { Button } from '../../components/common/Button';
import { NoticeBox, PublicList } from '../../components/layout/public/PublicSections';
import {
  fetchAccessRequestStatus,
  fetchDistricts,
  fetchStates,
  submitAccessRequest,
} from '../../lib/api';
import type { AdministrativeUnit } from '../../../shared/types';
import { ROLE_LABELS, ROLE_ORDER } from '../../lib/domainLabels';
import { Link, getRouteById } from '../../router';

type SubmitState = 'idle' | 'submitting' | 'succeeded' | 'rejected';

/**
 * Roles this page may offer for a request. Administrator and competent
 * authority are deliberately absent: asking for them here would be an attempt
 * at privilege escalation, and the API rejects them a second time.
 */
const REQUESTABLE_ROLES = ROLE_ORDER.filter((role) => role !== 'admin' && role !== 'approver');

/**
 * Institutional access request.
 *
 * OPTION SOURCES
 *   * State / District — real LGD administrative units returned by the
 *     BhoomiSetu server (authoritative LGD hierarchy). Never a hardcoded list,
 *     and never fetched from data.gov.in by the browser.
 *   * Role requested — the backend `UserRole` enum via `ROLE_LABELS`, minus the
 *     privileged roles, so the value the applicant picks is exactly a value the
 *     API will accept and never one that confers authority.
 *
 * SUBMISSION HONESTY
 *   Whether a workflow exists is asked of the API on mount, not assumed. If
 *   the backend reports none, the form is replaced by an explicit statement
 *   that nothing can be lodged — no simulated success, no silent discard.
 */
export const RequestAccessPage: React.FC = () => {
  // 'unknown' until the API answers, so the page never claims availability
  // (or its absence) before it has actually been checked.
  const [availability, setAvailability] = useState<'unknown' | 'available' | 'unavailable'>(
    'unknown'
  );
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  const [states, setStates] = useState<AdministrativeUnit[]>([]);
  const [districts, setDistricts] = useState<AdministrativeUnit[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [geographyError, setGeographyError] = useState<string | null>(null);

  const [stateCode, setStateCode] = useState('');
  const [districtCode, setDistrictCode] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [roleRequested, setRoleRequested] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [outcome, setOutcome] = useState<{
    tone: 'warning' | 'success';
    title: string;
    body: string;
  } | null>(null);

  const loginPath = getRouteById('auth.login').path;
  const submissionAvailable = availability === 'available';

  // Availability is a property of the backend, so it is read from the backend.
  useEffect(() => {
    let active = true;
    fetchAccessRequestStatus()
      .then((res) => {
        if (!active) return;
        setAvailability(res.available ? 'available' : 'unavailable');
        setAvailabilityMessage(res.message || null);
      })
      .catch(() => {
        if (!active) return;
        setAvailability('unavailable');
        setAvailabilityMessage(
          'The access-request workflow could not be confirmed, so nothing can be submitted.'
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // Tier 1: states, once. Parent-scoped, so districts are never fetched until
  // a state exists and are re-fetched (not accumulated) when it changes.
  useEffect(() => {
    let active = true;
    setStatesLoading(true);
    fetchStates()
      .then((res) => {
        if (!active) return;
        setStates(res.states || []);
        setGeographyError((res.states || []).length ? null : 'No administrative states are available.');
      })
      .catch(() => {
        if (active) setGeographyError('Administrative geography could not be loaded.');
      })
      .finally(() => {
        if (active) setStatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Tier 2: districts scoped to the selected state; clears every child value.
  useEffect(() => {
    setDistrictCode('');
    setDistricts([]);
    if (!stateCode) return;

    let active = true;
    setDistrictsLoading(true);
    fetchDistricts(stateCode)
      .then((res) => {
        if (!active) return;
        setDistricts(res.districts || []);
        setGeographyError(null);
      })
      .catch(() => {
        if (active) setGeographyError('Districts could not be loaded for the selected state.');
      })
      .finally(() => {
        if (active) setDistrictsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stateCode]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Enter your full name.';
    if (!email.trim()) next.email = 'Enter your official email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = 'Enter a valid email address.';
    if (!organization.trim()) next.organization = 'Enter your organisation.';
    if (!stateCode) next.state = 'Select your state / UT.';
    if (!roleRequested) next.role = 'Select the role you are requesting.';
    if (!reason.trim()) next.reason = 'Describe why you need access.';
    else if (reason.trim().length < 20)
      next.reason = 'Please provide a little more detail (at least 20 characters).';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setOutcome(null);
    if (!validate()) return;

    if (!submissionAvailable) {
      // Honest, non-delivering outcome. Nothing is transmitted or stored.
      setSubmitState('rejected');
      setOutcome({
        tone: 'warning',
        title: 'Request not submitted',
        body:
          'Access request submission is not connected in this deployment — no request was sent, ' +
          'received or stored. Your entries remain only in this browser tab. Contact your system ' +
          'administrator to have an account provisioned.',
      });
      return;
    }

    setSubmitState('submitting');
    try {
      const result = await submitAccessRequest({
        fullName: fullName.trim(),
        email: email.trim(),
        organization: organization.trim(),
        department: department.trim() || undefined,
        designation: designation.trim() || undefined,
        contactPhone: contact.trim() || undefined,
        stateCode: stateCode || undefined,
        districtCode: districtCode || undefined,
        justification: reason.trim(),
        requestedRole: roleRequested || undefined,
      });
      setSubmitState('succeeded');
      setOutcome({
        tone: 'success',
        title: 'Request recorded',
        body:
          `${result.message} Reference ${result.request.id}. ` +
          'No account has been created and no role has been granted — you cannot sign in until an ' +
          'administrator provisions one.',
      });
    } catch (err) {
      const e = err as Error & { code?: string; fields?: Record<string, string> };
      setSubmitState('rejected');
      if (e.fields && Object.keys(e.fields).length > 0) {
        setErrors((prev) => ({ ...prev, ...e.fields! }));
      }
      if (e.code === 'PRIVILEGED_ROLE_NOT_REQUESTABLE') {
        setErrors((prev) => ({ ...prev, role: 'Administrator and approver roles cannot be requested.' }));
      }
      if (e.code === 'DUPLICATE_REQUEST') {
        setOutcome({
          tone: 'warning',
          title: 'Already under review',
          body: e.message,
        });
      } else if (e.code === 'NOT_CONFIGURED') {
        setAvailability('unavailable');
        setAvailabilityMessage(e.message);
        setOutcome({
          tone: 'warning',
          title: 'Request not submitted',
          body:
            'No access-request workflow is configured for this deployment — nothing was stored. ' +
            'Contact your system administrator to have an account provisioned.',
        });
      } else {
        setOutcome({
          tone: 'warning',
          title: 'Request not submitted',
          body: e.message,
        });
      }
    }
  };

  const field = (name: string) => errors[name];

  return (
    <AuthShell
      title="Request access"
      subtitle="Ask for a BhoomiSetu account for your department. Requests are reviewed by an administrator — no access is granted automatically."
      banner={
        availability === 'unknown' ? (
          <NoticeBox tone="warning" title="Checking submission workflow">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Confirming whether an access-request workflow exists in this deployment…
            </span>
          </NoticeBox>
        ) : availability === 'available' ? (
          <NoticeBox tone="success" title="Requests are accepted">
            {availabilityMessage ||
              'Your request is stored for administrative review. No account or role is created by submitting it.'}
          </NoticeBox>
        ) : (
          <NoticeBox tone="warning" title="Submission not connected">
            {availabilityMessage ||
              'This deployment has no access-request workflow behind it, so the form below cannot ' +
                'lodge a request. It remains available so you can assemble the details an administrator will need.'}
          </NoticeBox>
        )
      }
      footer={
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to={loginPath} className="font-medium text-gov-navy hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {outcome && (
          <div role="alert">
            <NoticeBox tone={outcome.tone} title={outcome.title}>
              {outcome.body}
            </NoticeBox>
          </div>
        )}

        <AuthField id="ra-name" label="Full name" required error={field('fullName')}>
          <input
            id="ra-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
            aria-invalid={Boolean(field('fullName'))}
            aria-describedby={field('fullName') ? 'ra-name-error' : undefined}
          />
        </AuthField>

        <AuthField
          id="ra-email"
          label="Official email"
          required
          error={field('email')}
          hint="Use the address issued by your department."
        >
          <input
            id="ra-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            aria-invalid={Boolean(field('email'))}
            aria-describedby={field('email') ? 'ra-email-error' : undefined}
          />
        </AuthField>

        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField id="ra-org" label="Organisation" required error={field('organization')}>
            <input
              id="ra-org"
              type="text"
              autoComplete="organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="input"
              aria-invalid={Boolean(field('organization'))}
              aria-describedby={field('organization') ? 'ra-org-error' : undefined}
            />
          </AuthField>

          <AuthField id="ra-dept" label="Department">
            <input
              id="ra-dept"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input"
            />
          </AuthField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField id="ra-designation" label="Designation">
            <input
              id="ra-designation"
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="input"
            />
          </AuthField>

          <AuthField id="ra-role" label="Role requested" required error={field('role')}>
            <select
              id="ra-role"
              value={roleRequested}
              onChange={(e) => setRoleRequested(e.target.value)}
              className="input"
              aria-invalid={Boolean(field('role'))}
              aria-describedby={field('role') ? 'ra-role-error' : undefined}
            >
              <option value="">Select a role</option>
              {REQUESTABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </AuthField>
        </div>

        {/* Administrative scope: state → district, sourced from the loaded hierarchy */}
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Administrative scope
          </legend>
          {geographyError && (
            <p role="alert" className="mb-3 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {geographyError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField id="ra-state" label="State / UT" required error={field('state')}>
              <select
                id="ra-state"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                disabled={statesLoading}
                className="input"
                aria-invalid={Boolean(field('state'))}
                aria-describedby={field('state') ? 'ra-state-error' : undefined}
              >
                <option value="">
                  {statesLoading ? 'Loading states…' : states.length ? 'Select state / UT' : 'No states available'}
                </option>
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} (LGD: {s.code})
                  </option>
                ))}
              </select>
            </AuthField>

            <AuthField
              id="ra-district"
              label="District"
              hint={stateCode ? undefined : 'Select a state first.'}
            >
              <select
                id="ra-district"
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value)}
                disabled={!stateCode || districtsLoading}
                className="input"
              >
                <option value="">
                  {!stateCode
                    ? 'Select state first'
                    : districtsLoading
                      ? 'Loading districts…'
                      : districts.length
                        ? 'Select district'
                        : 'No districts found'}
                </option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name} (LGD: {d.code})
                  </option>
                ))}
              </select>
            </AuthField>
          </div>
        </fieldset>

        <AuthField
          id="ra-reason"
          label="Reason for access"
          required
          error={field('reason')}
          hint="Describe the work you need to perform in BhoomiSetu."
        >
          <textarea
            id="ra-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input resize-y"
            aria-invalid={Boolean(field('reason'))}
            aria-describedby={field('reason') ? 'ra-reason-error' : undefined}
          />
        </AuthField>

        <AuthField id="ra-contact" label="Contact information" hint="Phone or alternate contact (optional).">
          <input
            id="ra-contact"
            type="text"
            autoComplete="tel"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="input"
          />
        </AuthField>

        <div className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Submitting a request does not create an account. An administrator provisions access and
            the role determines which records and actions are visible to you.
          </span>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={submitState === 'submitting'}
          disabled={availability !== 'available' || submitState === 'submitting'}
          leftIcon={<Send className="h-4 w-4" />}
        >
          {availability === 'unknown' ? 'Checking availability…' : 'Submit request'}
        </Button>
      </form>

      {availability === 'unavailable' && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            What an administrator needs
          </p>
          <PublicList
            items={[
              'Your official email address and designation',
              'The state and district you work in',
              'The role your duties require',
              'A reason that justifies the level of access requested',
            ]}
          />
        </div>
      )}
    </AuthShell>
  );
};
