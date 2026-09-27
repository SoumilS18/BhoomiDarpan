import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  KeyRound,
  UserPlus,
  ExternalLink,
} from 'lucide-react';
import { AuthShell, AuthField } from '../../components/layout/auth/AuthShell';
import { Button } from '../../components/common/Button';
import { NoticeBox } from '../../components/layout/public/PublicSections';
import { useAuth } from '../../context/AuthContext';
import { Link, getRouteById, navigate, useRoute } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';

type FormStatus = 'idle' | 'submitting' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in page.
 *
 * CAPABILITY HONESTY
 *   When client-side Supabase auth is configured for this deployment the form
 *   performs a REAL password sign-in and the returned session token is used
 *   for every subsequent API call. When it is not configured the form is
 *   replaced by an explicit "authentication is not configured" state — this
 *   page never fabricates a session, never invents a successful login and
 *   never falls back to an evaluation persona.
 *
 *   Evaluation personas remain a *server-authorised non-production* mode
 *   driven by the role switcher inside the application; they are not a
 *   substitute for sign-in and are never offered here as one.
 */
export const LoginPage: React.FC = () => {
  const { signInWithPassword, isRealAuthConfigured, session, sessionStatus } = useAuth();
  const { query } = useRoute();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dashboardPath = getRouteById('module.dashboard').path;
  // Deep-link preservation: `/login?next=/cases/abc/gis` returns the officer
  // to the surface they originally requested after a successful sign-in.
  const nextPath = query.next && query.next.startsWith('/') ? query.next : dashboardPath;

  // Provider-returned errors (e.g. an expired or already-consumed reset link)
  // arrive as query parameters on the redirect back to this page.
  const providerError = query.error_description || query.error || query.message || null;

  // An authenticated visitor has no business on the sign-in form.
  useEffect(() => {
    if (session && sessionStatus === 'ready') {
      navigate(nextPath, { replace: true });
    }
  }, [session, sessionStatus, nextPath]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Enter your registered email or user ID.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Enter your password.';
    }
    setFieldError(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setStatus('submitting');
    const result = await signInWithPassword(email.trim(), password);
    if (result.ok) {
      // AuthContext propagates the real session; the effect above routes out.
      setStatus('idle');
      return;
    }
    setStatus('error');
    setFormError(result.message);
    if (result.code === 'invalid-credentials') {
      // Do not reveal which half of the credential pair was wrong.
      setFieldError({});
    }
  };

  const forgotPath = getRouteById('auth.forgotPassword').path;
  const activatePath = getRouteById('auth.activateAccount').path;
  const requestPath = getRouteById('auth.requestAccess').path;
  const privacyPath = getRouteById('public.privacy').path;
  const termsPath = getRouteById('public.terms').path;

  return (
    <AuthShell
      title="Sign in"
      subtitle={`Use the account issued to you for ${PUBLIC_CONFIG.name}.`}
      banner={
        !isRealAuthConfigured ? (
          <NoticeBox tone="warning" title="Authentication not configured">
            Password sign-in is not configured for this deployment, so this form cannot establish a
            session. No credentials are stored or simulated. Once a Supabase project is connected,
            this page signs officers in with real sessions.
          </NoticeBox>
        ) : providerError ? (
          <NoticeBox tone="warning" title="Link problem">
            {providerError}
          </NoticeBox>
        ) : null
      }
      footer={
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to={forgotPath} className="font-medium text-gov-navy hover:underline">
              Forgot password?
            </Link>
            <Link
              to={activatePath}
              className="inline-flex items-center gap-1.5 font-medium text-gov-navy hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Activate account
            </Link>
          </div>
          <p className="text-center text-sm text-slate-600">
            No account yet?{' '}
            <Link to={requestPath} className="font-medium text-gov-navy hover:underline">
              Request access
            </Link>
          </p>
          <p className="text-center text-xs leading-relaxed text-slate-500">
            By signing in you agree to the{' '}
            <Link to={termsPath} className="text-gov-navy hover:underline">
              Terms of Use
            </Link>{' '}
            and acknowledge the{' '}
            <Link to={privacyPath} className="text-gov-navy hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      }
    >
      {formError && (
        <div className="mb-4" role="alert">
          <NoticeBox tone="warning" title="Sign-in failed">
            {formError}
          </NoticeBox>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <AuthField
          id="login-email"
          label="Email / User ID"
          required
          error={fieldError.email}
        >
          <div className="relative">
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isRealAuthConfigured || status === 'submitting'}
              aria-invalid={Boolean(fieldError.email)}
              aria-describedby={fieldError.email ? 'login-email-error' : undefined}
              placeholder="officer@example.org"
              className="input"
            />
          </div>
        </AuthField>

        <AuthField id="login-password" label="Password" required error={fieldError.password}>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isRealAuthConfigured || status === 'submitting'}
              aria-invalid={Boolean(fieldError.password)}
              aria-describedby={fieldError.password ? 'login-password-error' : undefined}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
              tabIndex={0}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </AuthField>

        {!isRealAuthConfigured && (
          <p className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              Set <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> to enable
              password authentication for this deployment.
            </span>
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={status === 'submitting'}
          disabled={!isRealAuthConfigured}
          leftIcon={<LogIn className="h-4 w-4" />}
        >
          Sign In
        </Button>
      </form>

      <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Authorised personnel only. Access is logged and subject to the platform audit trail.
        </span>
      </div>

      {sessionStatus === 'restoring' && (
        <p className="sr-only" role="status">
          Checking for an existing session
        </p>
      )}
    </AuthShell>
  );
};
