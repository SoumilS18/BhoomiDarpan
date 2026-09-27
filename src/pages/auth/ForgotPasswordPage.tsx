import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { AuthShell, AuthField } from '../../components/layout/auth/AuthShell';
import { Button } from '../../components/common/Button';
import { NoticeBox } from '../../components/layout/public/PublicSections';
import { supabase, isClientSupabaseConfigured } from '../../lib/supabase';
import { Link, getRouteById } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password recovery request.
 *
 * Connected to the real authentication provider (`supabase.auth
 * .resetPasswordForEmail`) whenever client auth is configured. Every outcome
 * the provider can produce — invalid input, rate limiting, unreachable
 * service, generic failure — is surfaced honestly. Success is only reported
 * when the provider accepted the request; the page never claims a mail was
 * delivered when the service is not configured.
 */
export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const loginPath = getRouteById('auth.login').path;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setRateLimited(false);

    const value = email.trim();
    if (!value) {
      setFieldError('Enter the email address registered to your account.');
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError(null);

    if (!isClientSupabaseConfigured || !supabase) {
      setStatus('error');
      setFormError(
        'Password recovery is not configured for this deployment. Contact your system administrator to reset your password.'
      );
      return;
    }

    setStatus('submitting');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${window.location.origin}${getRouteById('auth.resetPassword').path}`,
      });

      if (error) {
        setStatus('error');
        const code = (error as { code?: string }).code ?? '';
        if (code.includes('rate_limit') || /rate limit/i.test(error.message)) {
          setRateLimited(true);
          setFormError(
            'Too many reset requests have been submitted for this address. Wait a short period before trying again.'
          );
        } else if (/email not confirmed/i.test(error.message)) {
          setFormError('This address has not been confirmed. Activate the account first.');
        } else {
          setFormError(error.message || 'The reset request could not be processed. Try again.');
        }
        return;
      }

      setStatus('sent');
    } catch {
      setStatus('error');
      setFormError(
        'The authentication service could not be reached. Check connectivity and try again.'
      );
    }
  };

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter the address registered to your account and we will request a password reset link from the authentication provider."
      banner={
        !isClientSupabaseConfigured ? (
          <NoticeBox tone="warning" title="Recovery service not configured">
            Password recovery is not available for this deployment. No reset request can be sent
            until an authentication provider is connected.
          </NoticeBox>
        ) : null
      }
      footer={
        <p className="text-center text-sm text-slate-600">
          Remembered your password?{' '}
          <Link to={loginPath} className="font-medium text-gov-navy hover:underline">
            Back to Sign In
          </Link>
        </p>
      }
    >
      {status === 'sent' ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-gov-emerald">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gov-slate">Reset request submitted</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              If an account exists for <span className="font-medium text-gov-slate">{email}</span>,
              a password reset link will be issued by the authentication provider. The link expires
              after a short period and can be used once.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              For security, the same confirmation is shown whether or not the address is registered.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStatus('idle');
              setEmail('');
            }}
          >
            Send another request
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div role="alert">
              <NoticeBox
                tone="warning"
                title={rateLimited ? 'Rate limited' : 'Request failed'}
              >
                {formError}
              </NoticeBox>
            </div>
          )}

          <AuthField
            id="forgot-email"
            label="Email / User ID"
            required
            error={fieldError}
          >
            <input
              id="forgot-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'submitting'}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'forgot-email-error' : undefined}
              placeholder="officer@example.org"
              className="input"
            />
          </AuthField>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={status === 'submitting'}
            disabled={!isClientSupabaseConfigured}
          >
            {status === 'submitting' ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}

      {status === 'submitting' && (
        <p className="sr-only" role="status">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Sending reset request
        </p>
      )}
      {status === 'sent' && (
        <p className="sr-only" role="status">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Reset request submitted
        </p>
      )}
    </AuthShell>
  );
};

/** Rendered as part of the footer where a back-navigation affordance is wanted. */
export const ForgotPasswordBackLink: React.FC = () => (
  <Link
    to={getRouteById('auth.login').path}
    className="inline-flex items-center gap-1.5 text-sm font-medium text-gov-navy hover:underline"
  >
    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
    Back to Sign In
  </Link>
);
