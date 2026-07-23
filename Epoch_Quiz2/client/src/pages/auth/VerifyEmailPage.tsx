import React, { useEffect, useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { AuthIllustration } from './_shared';
import { verifyEmail, resendVerificationCode, toUIRole } from '../../lib/authStore';
import { ApiError } from '../../lib/api';
import { consumePostAuthRedirect } from '../../lib/postAuthRedirect';

interface Props { navigate: NavigateFn; email: string; }

const RESEND_COOLDOWN_SEC = 60;

export const VerifyEmailPage: React.FC<Props> = ({ navigate, email }) => {
  const [code, setCode]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode]   = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const finishAuth = (user: { name: string; profileComplete: boolean; role: string }) => {
    if (consumePostAuthRedirect()) {
      showToast('Email verified — heading back to your quiz', 'success');
      return;
    }
    if (toUIRole(user.role as any) !== 'admin' && !user.profileComplete) {
      showToast(`Email verified — let's set up your profile, ${user.name}!`, 'success');
      window.location.hash = '#/complete-profile';
      return;
    }
    showToast(`Email verified — welcome, ${user.name}!`, 'success');
    window.location.href = '/#/home';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from your email.'); return; }
    setError('');
    setLoading(true);
    try {
      const user = await verifyEmail(email, code.trim());
      finishAuth(user);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const result = await resendVerificationCode(email);
      showToast('A new code has been sent to your email.', 'success');
      setCooldown(RESEND_COOLDOWN_SEC);
      if (result.devCode) setDevCode(result.devCode);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not resend the code. Please try again.';
      showToast(msg, 'danger');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="/assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympiad <em>Quiz</em></div>
            <div className="auth-brand-sub">STUDENT PRACTICE PLATFORM</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Verify your email</h2>
          <p className="auth-sub">
            We've sent a 6-digit code to <strong>{email}</strong>. Enter it below to activate your account.
            Check your spam folder if you don't see it.
          </p>
        </div>

        {devCode && (
          <div style={{ background: 'rgba(212,20,138,0.08)', border: '1px solid rgba(212,20,138,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Development mode — verification code
            </p>
            <code style={{ fontSize: 16, color: 'var(--brand)', letterSpacing: '0.2em' }}>{devCode}</code>
          </div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <div className="auth-field-header"><label className="auth-label">Verification code</label></div>
            <div className={`auth-input-wrap ${error ? 'error' : ''}`}>
              <span className="auth-input-icon"><Icon name="lock" size={16} /></span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="auth-input"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="123456"
                maxLength={6}
                style={{ letterSpacing: '0.3em' }}
              />
            </div>
            {error && <span className="auth-error">{error}</span>}
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading
              ? <><span className="auth-spinner" /> Verifying…</>
              : <>Verify email <Icon name="arrowRight" size={16} /></>
            }
          </button>
        </form>

        <p className="auth-switch">
          Didn't get the code?{' '}
          <button className="auth-link" onClick={resend} disabled={cooldown > 0 || resending}>
            {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
