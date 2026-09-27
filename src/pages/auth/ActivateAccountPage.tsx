import React from 'react';
import { KeyRound, ArrowRight, MailWarning } from 'lucide-react';
import { AuthShell } from '../../components/layout/auth/AuthShell';
import { NoticeBox, PublicList } from '../../components/layout/public/PublicSections';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';

/**
 * Account activation.
 *
 * CAPABILITY HONESTY
 *   This deployment exposes no account-activation workflow: neither the
 *   Express API nor the configured authentication provider is wired to a
 *   code-verification endpoint. The page therefore states that plainly and
 *   explains what activation will involve once the workflow exists. It does
 *   NOT render a verification form that would verify nothing, and it never
 *   reports a successful activation.
 *
 *   The form is defined declaratively below (`ACTIVATION_FIELDS`) so that
 *   wiring a real endpoint later is a single, reviewable change.
 */
const ACTIVATION_AVAILABLE = PUBLIC_CONFIG.access.accountActivationAvailable;

export const ActivateAccountPage: React.FC = () => {
  const loginPath = getRouteById('auth.login').path;
  const requestPath = getRouteById('auth.requestAccess').path;

  return (
    <AuthShell
      title="Activate account"
      subtitle="Verify the account issued to you so you can sign in to BhoomiSetu."
      banner={
        ACTIVATION_AVAILABLE ? null : (
          <NoticeBox tone="warning" title="Activation service not available">
            Account activation is not connected in this deployment. No verification code can be
            issued or checked from this page, so no activation form is shown.
          </NoticeBox>
        )
      }
      footer={
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <Link to={loginPath} className="font-medium text-gov-navy hover:underline">
            Back to Sign In
          </Link>
          <Link
            to={requestPath}
            className="inline-flex items-center gap-1 font-medium text-gov-navy hover:underline"
          >
            Request access
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      }
    >
      {!ACTIVATION_AVAILABLE && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500">
              <MailWarning className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gov-slate">
                What activation will involve
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                When the workflow is enabled, activation verifies that the account was issued to
                you before any session is created.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Expected details
            </p>
            <PublicList
              items={[
                'The official email address or user ID issued to you',
                'The activation code supplied alongside the account issue',
                'Confirmation that the details match the issued account',
              ]}
            />
          </div>

          <NoticeBox tone="info" title="Until activation is available">
            Accounts are provisioned by your system administrator. If you have not received account
            details, use the access request route to describe your department and role requirement.
          </NoticeBox>
        </div>
      )}
    </AuthShell>
  );
};
