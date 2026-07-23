import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { Field, PasswordFieldInner, AuthIllustration, validateEmail, validateName } from './_shared';
import { register } from '../../lib/authStore';
import { ApiError } from '../../lib/api';
import { consumePostAuthRedirect } from '../../lib/postAuthRedirect';

interface SignupPageProps { navigate: NavigateFn; }

type Role = 'TEACHER' | 'STUDENT';

// Student is the only signup role while Teacher signup is hidden, so there's
// nothing for a user to actually choose — the role picker below is removed
// rather than shown with one pre-selected option. Restore both the picker
// UI and the `role`/`setRole` state (replacing the constant a few lines
// down) once a second signup role (e.g. Teacher) is enabled again:
//
// const ROLES: { id: Role; label: string; sub: string; icon: string }[] = [
//   { id: 'TEACHER', label: 'Teacher', sub: 'Create & grade assessments',  icon: 'user' },
//   { id: 'STUDENT', label: 'Student', sub: 'Take quizzes & track scores', icon: 'graduation' },
// ];
//
// <div className="auth-field">
//   <label className="auth-label">I am a…</label>
//   <div className="role-grid">
//     {ROLES.map(r => (
//       <button
//         key={r.id}
//         type="button"
//         onClick={() => setRole(r.id)}
//         className={`role-card ${role === r.id ? 'selected' : ''}`}
//         aria-pressed={role === r.id}
//       >
//         <span className="role-ico"><Icon name={r.icon} size={18} /></span>
//         <span className="role-text">
//           <span className="role-name">{r.label}</span>
//           <span className="role-sub">{r.sub}</span>
//         </span>
//         <span className="role-check">
//           {role === r.id && <Icon name="check" size={14} />}
//         </span>
//       </button>
//     ))}
//   </div>
// </div>

export const SignupPage: React.FC<SignupPageProps> = ({ navigate }) => {
  const [name, setName]         = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  // Fixed — see the note above the (currently hidden) role picker.
  const role: Role = 'STUDENT';
  const [agreed, setAgreed]     = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const nErr = validateName(name);
    const eErr = validateEmail(email);
    if (nErr) errs.name = nErr;
    if (eErr) errs.email = eErr;
    if (!/^\d{7,}$/.test(mobileNo.replace(/[\s\-\+\(\)]/g, ''))) errs.mobileNo = 'Enter a valid mobile number (min 7 digits)';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!agreed) errs.terms = 'You must agree to the terms.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const user = await register(name, email, password, role, mobileNo);

      if (consumePostAuthRedirect()) {
        showToast('Account created — heading back to your quiz', 'success');
      } else if (!user.profileComplete) {
        showToast(`Account created — let's set up your profile, ${user.name}!`, 'success');
        window.location.hash = '#/complete-profile';
      } else {
        // No specific page was requested — land on Home, not the Dashboard.
        showToast(`Account created — welcome, ${user.name}!`, 'success');
        window.location.href = '/#/home';
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      setErrors({ email: msg });
    } finally {
      setLoading(false);
    }
  };

  const strength = password.length === 0 ? 0
    : password.length < 8 ? 1
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 3 : 2;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#FF6B6B', '#f59e0b', '#22c55e'][strength];

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
          <h2 className="auth-title">Create your account</h2>
          <p className="auth-sub">Create your student account to get started.</p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>

          <Field
            label="Full name" type="text" value={name} onChange={setName}
            placeholder="Your full name" icon="user" error={errors.name}
          />
          <Field
            label="Mobile number" type="tel" value={mobileNo} onChange={setMobileNo}
            placeholder="+91 98765 43210" icon="phone" error={errors.mobileNo}
          />
          <Field
            label="Email address" type="email" value={email} onChange={setEmail}
            placeholder="you@example.com" icon="mail" error={errors.email}
          />

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className={`auth-input-wrap ${errors.password ? 'error' : ''}`}>
              <span className="auth-input-icon"><Icon name="lock" size={16} /></span>
              <PasswordFieldInner value={password} onChange={setPassword} />
            </div>
            {password.length > 0 && (
              <div className="auth-strength">
                <div className="auth-strength-bars">
                  {[1, 2, 3].map(n => (
                    <span key={n} className="auth-strength-bar"
                      style={{ background: strength >= n ? strengthColor : 'var(--border-2)' }} />
                  ))}
                </div>
                <span className="auth-strength-label" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
            {errors.password && <span className="auth-error">{errors.password}</span>}
          </div>

          <label className="auth-checkbox-row">
            <input type="checkbox" className="auth-checkbox"
              checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span className="auth-checkbox-label">
              I agree to the{' '}
              <button type="button" className="auth-link" onClick={() => navigate('terms')}>Terms</button>
              {' '}and{' '}
              <button type="button" className="auth-link" onClick={() => navigate('privacy')}>Privacy Policy</button>
            </span>
          </label>
          {errors.terms && <span className="auth-error" style={{ marginTop: -8 }}>{errors.terms}</span>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading
              ? <><span className="auth-spinner" /> Creating account…</>
              : <>Create Account <Icon name="arrowRight" size={16} /></>
            }
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button className="auth-link" onClick={() => navigate('login')}>Sign in</button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
