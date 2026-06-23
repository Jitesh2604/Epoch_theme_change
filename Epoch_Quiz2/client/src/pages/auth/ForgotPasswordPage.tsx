import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { AuthIllustration, validateEmail } from './_shared';
import { forgotPassword } from '../../lib/authStore';
import { ApiError } from '../../lib/api';

interface Props { navigate: NavigateFn; }

export const ForgotPasswordPage: React.FC<Props> = ({ navigate }) => {
  const [email, setEmail]   = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const result = await forgotPassword(email);
      setSent(true);
      // In development the backend returns the token so you can test without email.
      if (result.resetToken) setDevToken(result.resetToken);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympaid <em>Quiz</em></div>
            <div className="auth-brand-sub">EPOCH · AI · CO-PILOT</div>
          </div>
        </button>

        {sent ? (
          <div>
            <div className="auth-head">
              <h2 className="auth-title">Check your inbox</h2>
              <p className="auth-sub">
                If <strong>{email}</strong> is registered, a password reset link has been sent.
                Check your spam folder if you don't see it.
              </p>
            </div>

            {devToken && (
              <div style={{ background: 'rgba(212,20,138,0.08)', border: '1px solid rgba(212,20,138,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Development mode — reset token
                </p>
                <code style={{ fontSize: 11, color: 'var(--brand)', wordBreak: 'break-all' }}>{devToken}</code>
                <button
                  className="btn btn-soft"
                  style={{ marginTop: 10, width: '100%', fontSize: 12, padding: '8px 12px' }}
                  onClick={() => navigate(`reset-password/${devToken}`)}
                >
                  Open reset page →
                </button>
              </div>
            )}

            <button className="btn btn-primary auth-submit" onClick={() => navigate('login')} style={{ width: '100%' }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="auth-head">
              <h2 className="auth-title">Forgot password?</h2>
              <p className="auth-sub">
                Enter the email address you used to sign up and we'll send you a reset link.
              </p>
            </div>

            <form className="auth-form" onSubmit={submit} noValidate>
              <div className="auth-field">
                <div className="auth-field-header">
                  <label className="auth-label">Email address</label>
                </div>
                <div className={`auth-input-wrap ${error ? 'error' : ''}`}>
                  <span className="auth-input-icon"><Icon name="mail" size={16} /></span>
                  <input
                    type="email"
                    className="auth-input"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                {error && <span className="auth-error">{error}</span>}
              </div>

              <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                {loading
                  ? <><span className="auth-spinner" /> Sending…</>
                  : <>Send reset link <Icon name="arrowRight" size={16} /></>
                }
              </button>
            </form>

            <p className="auth-switch">
              Remember your password?{' '}
              <button className="auth-link" onClick={() => navigate('login')}>Sign in</button>
            </p>
          </>
        )}
      </div>
      <AuthIllustration />
    </div>
  );
};
