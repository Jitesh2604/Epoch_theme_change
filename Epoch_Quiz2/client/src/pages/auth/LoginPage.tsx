import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { Field, AuthIllustration, validateEmail } from './_shared';
import { login, toUIRole } from '../../lib/authStore';
import { ApiError } from '../../lib/api';

interface LoginPageProps { navigate: NavigateFn; }

export const LoginPage: React.FC<LoginPageProps> = ({ navigate }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const eErr = validateEmail(email);
    if (eErr)           errs.email    = eErr;
    if (!password)      errs.password = 'Password is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const user = await login(email, password);
      const uiRole = toUIRole(user.role);

      const pending = localStorage.getItem('epoch-after-auth');
      if (pending) {
        localStorage.removeItem('epoch-after-auth');
        showToast('Welcome back — heading to your quiz', 'success');
        window.location.hash = pending.startsWith('#') ? pending : '#' + pending;
        return;
      }

      // Force onboarding before dashboard access for teachers/students.
      if (uiRole !== 'admin' && !user.profileComplete) {
        showToast(`Welcome back, ${user.name} — let's finish your profile`, 'success');
        window.location.hash = '#/complete-profile';
        return;
      }

      showToast(`Welcome back, ${user.name}!`, 'success');
      window.location.href = uiRole === 'student' ? '/#/home' : `/${uiRole}`;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
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
            <div className="auth-brand-name">Olympaid <em>Quiz</em></div>
            <div className="auth-brand-sub">EPOCH · AI · CO-PILOT</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-sub">Sign in to continue your olympiad journey.</p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          <Field
            label="Email address" type="email" value={email} onChange={setEmail}
            placeholder="you@example.com" icon="mail" error={errors.email}
          />
          <Field
            label="Password" type="password" value={password} onChange={setPassword}
            placeholder="••••••••" icon="lock" error={errors.password}
            extra={
              <button type="button" className="auth-forgot"
                onClick={() => navigate('forgot-password')}>
                Forgot password?
              </button>
            }
          />

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading
              ? <><span className="auth-spinner" /> Signing in…</>
              : <>Sign In <Icon name="arrowRight" size={16} /></>
            }
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button className="auth-link" onClick={() => navigate('signup')}>Create one free</button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
