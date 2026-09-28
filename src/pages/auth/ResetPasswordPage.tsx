import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, AlertCircle, Check, X, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { AuthShell, AuthField } from '../../components/layout/auth/AuthShell';
import { Button } from '../../components/common/Button';
import { NoticeBox } from '../../components/layout/public/PublicSections';
import { supabase, isClientSupabaseConfigured } from '../../lib/supabase';
import { Link, getRouteById, navigate, useRoute } from '../../router';

type Status = 'idle' | 'checking' | 'ready' | 'submitting' | 'done' | 'error' | 'unavailable';

interface Requirement {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** Requirements enforced by this form before the provider is called. */
const REQUIREMENTS: Requirement[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'case', label: 'Mix of letter cases', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: 'digit', label: 'At least one number', test: (v) => /\d/.test(v) },
];

/**
 * Set a new password from a provider-issued recovery link.
 *
 * The page only unlocks once the authentication provider has established a
 * recovery session (i.e. the officer arrived through the emailed link).
 * Without that session it says so plainly instead of showing a form that
 * could never succeed.
 */
export const ResetPasswordPage: React.FC = () => {
  const { query } = useRoute();
  const [status, setStatus] = useState<Status>(isClientSupabaseConfigured ? 'checking' : 'unavailable');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const loginPath = getRouteById('auth.login').path;
  const forgotPath = getRouteById('auth.forgotPassword').path;

  // Detect the recovery session that the provider establishes when the
  // emailed link lands on this route.
  useEffect(() => {
    if (!supabase || !isClientSupabaseConfigured) {
      setStatus('unavailable');
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setStatus(data.session ? 'ready' : 'error');
        if (!data.session) {
          setFormError(
            query.error_description ||
              'This page can only be opened from the password reset link issued to your email address.'
          );
        }
      })
      .catch(() => {
        if (active) {
          setStatus('error');
          setFormError('The authentication service could not be reached. Request a new link.');
        }
      });

    return () => {
      active = false;
    };
  }, [query.error_description]);

  const allValid = REQUIREMENTS.every((r) => r.test(password));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const errors: { password?: string; confirm?: string } = {};
    if (!password) {
      errors.password = 'Enter a new password.';
    } else if (!allValid) {
      errors.password = 'Your password does not meet all of the requirements below.';
    }
    if (confirm !== password) {
      errors.confirm = 'The two passwords do not match.';
    }
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;

    if (!supabase) {
      setStatus('unavailable');
      return;
    }

    setStatus('submitting');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus('ready');
        setFormError(
          /similar|weak/i.test(error.message)
            ? 'Choose a password that differs from your previous one.'
            : error.message || 'The password could not be updated. Request a new reset link.'
        );
        return;
      }
      setStatus('done');
      setPassword('');
      setConfirm('');
    } catch {
      setStatus('error');
      setFormError('The authentication service could not be reached. Request a new reset link.');
    }
  };

  const requirementRow = (req: Requirement) => {
    const passed = req.test(password);
    return (
      <li
        key={req.id}
        className={clsx(
          'flex items-center gap-2 text-xs',
          passed ? 'text-gov-emerald' : 'text-slate-500'
        )}
      >
        {passed ? (
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{req.label}</span>
        <span className="sr-only">{passed ? '(met)' : '(not met)'}</span>
      </li>
    );
  };

  // Computed before render so the JSX branches below don't narrow `status`.
  const isSubmitting = status === 'submitting';

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your BhoomiDarpan account."
      banner={
        status === 'unavailable' ? (
          <NoticeBox tone="warning" title="Password reset not configured">
            Password reset is not available for this deployment because no authentication provider
            is connected. Contact your system administrator to have your password changed.
          </NoticeBox>
        ) : status === 'error' ? (
          <NoticeBox tone="warning" title="Reset link required or expired">
            {formError}
          </NoticeBox>
        ) : null
      }
      footer={
        status !== 'done' ? (
          <p className="text-center text-sm text-slate-600">
            <Link to={loginPath} className="font-medium text-gov-navy hover:underline">
              Back to Sign In
            </Link>
          </p>
        ) : undefined
      }
    >
      {status === 'done' ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-gov-emerald">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gov-slate">Password updated</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Your password has been changed. Sign in with the new password to continue.
            </p>
          </div>
          <Button className="w-full" onClick={() => navigate(loginPath)}>
            Continue to Sign In
          </Button>
        </div>
      ) : status === 'checking' ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-600" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gov-navy border-t-transparent" />
          Verifying reset link…
        </div>
      ) : status === 'ready' ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <AuthField id="reset-password" label="New password" required error={fieldError.password}>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldError.password)}
                aria-describedby={fieldError.password ? 'reset-password-error' : 'reset-requirements'}
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </AuthField>

          <div id="reset-requirements" className="rounded-md bg-slate-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Password requirements
            </p>
            <ul className="space-y-1.5">{REQUIREMENTS.map(requirementRow)}</ul>
          </div>

          <AuthField id="reset-confirm" label="Confirm new password" required error={fieldError.confirm}>
            <input
              id="reset-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldError.confirm)}
              aria-describedby={fieldError.confirm ? 'reset-confirm-error' : undefined}
              className="input"
            />
          </AuthField>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
            leftIcon={<RotateCcw className="h-4 w-4" />}
          >
            Reset password
          </Button>
        </form>
      ) : (
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <p>
            Request a fresh link from the{' '}
            <Link to={forgotPath} className="font-medium text-gov-navy hover:underline">
              forgot password
            </Link>{' '}
            page and open it directly to set a new password.
          </p>
        </div>
      )}
    </AuthShell>
  );
};
