import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { AuthShell, AuthField } from '../../components/layout/auth/AuthShell';
import { Button } from '../../components/common/Button';
import { NoticeBox } from '../../components/layout/public/PublicSections';
import { DemoRoleSelector } from '../../components/auth/DemoRoleSelector';
import { DEMO_ACCOUNTS_MAP, type DemoRoleAccount } from '../../lib/demoAccounts';
import { useAuth } from '../../context/AuthContext';
import { Link, getRouteById, navigate, useRoute } from '../../router';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';
import type { UserRole } from '../../../shared/types';
import { clsx } from 'clsx';

type FormStatus = 'idle' | 'submitting' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in page with evaluation demo role shortcuts for hackathon judges and officers.
 */
export const LoginPage: React.FC = () => {
  const { signInWithPassword, isRealAuthConfigured, session, sessionStatus } = useAuth();
  const { query } = useRoute();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [recentlyFilled, setRecentlyFilled] = useState(false);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dashboardPath = getRouteById('module.dashboard').path;
  const nextPath = query.next && query.next.startsWith('/') ? query.next : dashboardPath;

  const providerError = query.error_description || query.error || query.message || null;

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

  const executeSignIn = async (targetEmail: string, targetPass: string) => {
    setFormError(null);
    setStatus('submitting');
    const result = await signInWithPassword(targetEmail.trim(), targetPass);
    if (result.ok) {
      setStatus('idle');
      return;
    }
    setStatus('error');
    setFormError(result.message);
    if (result.code === 'invalid-credentials') {
      setFieldError({});
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    await executeSignIn(email, password);
  };

  /**
   * Called when a demo role button is clicked.
   * Auto-fills the credentials into email & password state, triggers a visual pulse,
   * and optionally signs in directly if requested.
   */
  const handleSelectRole = async (account: DemoRoleAccount, autoSignIn = false) => {
    setEmail(account.email);
    setPassword(account.password);
    setSelectedRole(account.role);
    setFieldError({});
    setFormError(null);

    // Visual pulse animation on input fields
    setRecentlyFilled(true);
    setTimeout(() => setRecentlyFilled(false), 1600);

    if (autoSignIn) {
      await executeSignIn(account.email, account.password);
    }
  };

  const handleClearCredentials = () => {
    setEmail('');
    setPassword('');
    setSelectedRole(null);
    setFieldError({});
    setFormError(null);
  };

  const selectedAccount = selectedRole ? DEMO_ACCOUNTS_MAP[selectedRole] : null;

  const forgotPath = getRouteById('auth.forgotPassword').path;
  const activatePath = getRouteById('auth.activateAccount').path;
  const requestPath = getRouteById('auth.requestAccess').path;
  const privacyPath = getRouteById('public.privacy').path;
  const termsPath = getRouteById('public.terms').path;

  return (
    <AuthShell
      title="Sign in"
      subtitle={`Use the account issued to you for ${PUBLIC_CONFIG.name}.`}
      maxWidth="3xl"
      banner={
        !isRealAuthConfigured ? (
          <NoticeBox tone="warning" title="Authentication not configured">
            Password sign-in is not configured for this deployment, so this form cannot establish a
            session. Once a Supabase project is connected, this page signs officers in with real sessions.
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
      {/* Demo Roles Evaluation Buttons for Hackathon Judges */}
      <DemoRoleSelector
        selectedRole={selectedRole}
        onSelectRole={handleSelectRole}
        disabled={!isRealAuthConfigured || status === 'submitting'}
      />

      {formError && (
        <div className="mb-4" role="alert">
          <NoticeBox tone="warning" title="Sign-in failed">
            {formError}
          </NoticeBox>
        </div>
      )}

      {/* Selected Demo Role Confirmation Banner */}
      {selectedAccount && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-terra-200/90 bg-terra-50/60 p-3 text-xs text-terra-950 shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terra-700 text-white">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 truncate">
              <p className="font-bold text-terra-900 truncate">
                Credentials filled for {selectedAccount.roleLabel}
              </p>
              <p className="text-[11px] text-mocha-600 truncate">
                ID: <span className="font-mono font-medium">{selectedAccount.email}</span> • {selectedAccount.department}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearCredentials}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-mocha-600 hover:text-terra-800 transition-colors underline cursor-pointer"
            title="Clear prefilled credentials"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <AuthField
          id="login-email"
          label="Email / User ID"
          required
          error={fieldError.email}
          hint={
            selectedAccount
              ? `Autofilled with verified ${selectedAccount.roleLabel} credential`
              : 'Registered government officer email or identifier'
          }
        >
          <div className="relative">
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (selectedAccount && e.target.value !== selectedAccount.email) {
                  setSelectedRole(null);
                }
              }}
              disabled={!isRealAuthConfigured || status === 'submitting'}
              aria-invalid={Boolean(fieldError.email)}
              aria-describedby={fieldError.email ? 'login-email-error' : undefined}
              placeholder="officer@example.org"
              className={clsx(
                'input transition-all duration-300',
                recentlyFilled && 'ring-2 ring-terra-500 bg-terra-50/20'
              )}
            />
          </div>
        </AuthField>

        <AuthField
          id="login-password"
          label="Password"
          required
          error={fieldError.password}
          hint={
            selectedAccount
              ? 'Demo password filled. Click the eye icon to view if needed.'
              : undefined
          }
        >
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (selectedAccount && e.target.value !== selectedAccount.password) {
                  setSelectedRole(null);
                }
              }}
              disabled={!isRealAuthConfigured || status === 'submitting'}
              aria-invalid={Boolean(fieldError.password)}
              aria-describedby={fieldError.password ? 'login-password-error' : undefined}
              className={clsx(
                'input pr-10 transition-all duration-300',
                recentlyFilled && 'ring-2 ring-terra-500 bg-terra-50/20'
              )}
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
          {status === 'submitting'
            ? 'Authenticating...'
            : selectedAccount
            ? `Sign In as ${selectedAccount.roleLabel}`
            : 'Sign In'}
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
