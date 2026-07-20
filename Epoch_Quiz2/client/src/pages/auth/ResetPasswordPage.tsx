import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { AuthIllustration } from './_shared';
import { resetPassword } from '../../lib/authStore';
import { ApiError } from '../../lib/api';

interface Props { navigate: NavigateFn; token: string; }

function strength(p: string): { level: number; label: string; color: string } {
  let s = 0;
  if (p.length >= 8)          s++;
  if (/[A-Z]/.test(p))        s++;
  if (/[0-9]/.test(p))        s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#ef4444', '#f59e0b', '#22c55e', '#22c55e'];
  return { level: s, label: labels[s] || '', color: colors[s] || '' };
}

export const ResetPasswordPage: React.FC<Props> = ({ navigate, token }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const pw = strength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (password.length < 8)  errs.password = 'Password must be at least 8 characters';
    if (password !== confirm)  errs.confirm  = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Reset failed. The link may have expired.';
      setErrors({ password: msg });
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
            <div className="auth-brand-name">Olympiad <em>Quiz</em></div>
            <div className="auth-brand-sub">EPOCH · AI · CO-PILOT</div>
          </div>
        </button>

        {done ? (
          <div>
            <div className="auth-head">
              <h2 className="auth-title">Password updated</h2>
              <p className="auth-sub">Your password has been reset successfully. You can now sign in with your new password.</p>
            </div>
            <button className="btn btn-primary auth-submit" onClick={() => navigate('login')} style={{ width: '100%' }}>
              Sign in <Icon name="arrowRight" size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="auth-head">
              <h2 className="auth-title">Reset your password</h2>
              <p className="auth-sub">Enter a new password for your account.</p>
            </div>

            <form className="auth-form" onSubmit={submit} noValidate>
              <div className="auth-field">
                <div className="auth-field-header"><label className="auth-label">New password</label></div>
                <div className={`auth-input-wrap ${errors.password ? 'error' : ''}`}>
                  <span className="auth-input-icon"><Icon name="lock" size={16} /></span>
                  <input
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors({}); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
                {password && (
                  <div className="auth-strength">
                    <div className="auth-strength-bars">
                      {[1, 2, 3, 4].map(n => (
                        <div key={n} className="auth-strength-bar" style={{ background: n <= pw.level ? pw.color : 'var(--border-1)' }} />
                      ))}
                    </div>
                    <span className="auth-strength-label" style={{ color: pw.color }}>{pw.label}</span>
                  </div>
                )}
                {errors.password && <span className="auth-error">{errors.password}</span>}
              </div>

              <div className="auth-field">
                <div className="auth-field-header"><label className="auth-label">Confirm password</label></div>
                <div className={`auth-input-wrap ${errors.confirm ? 'error' : ''}`}>
                  <span className="auth-input-icon"><Icon name="lock" size={16} /></span>
                  <input
                    type="password"
                    className="auth-input"
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setErrors({}); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirm && <span className="auth-error">{errors.confirm}</span>}
              </div>

              <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                {loading
                  ? <><span className="auth-spinner" /> Saving…</>
                  : <>Set new password <Icon name="arrowRight" size={16} /></>
                }
              </button>
            </form>

            <p className="auth-switch">
              <button className="auth-link" onClick={() => navigate('login')}>Back to sign in</button>
            </p>
          </>
        )}
      </div>
      <AuthIllustration />
    </div>
  );
};
