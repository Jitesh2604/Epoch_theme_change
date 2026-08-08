import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { AuthIllustration } from '../auth/_shared';

interface SchoolLandingPageProps { navigate: NavigateFn; }

// Entry point for the School Panel — kept as its own page (rather than
// folding the CTA into RoleSelectionPage/SignupPage) since School
// registration is a deliberately separate flow from Student sign-up.
export const SchoolLandingPage: React.FC<SchoolLandingPageProps> = ({ navigate }) => {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="/assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympiad <em>Quiz</em></div>
            <div className="auth-brand-sub">SCHOOL PANEL</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Register your school</h2>
          <p className="auth-sub">
            Bring Epoch Quiz to your school. Register your school's branch below — an administrator will review and
            approve your account before you can sign in.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary auth-submit"
          onClick={() => navigate('school/register')}
        >
          Register your school <Icon name="arrowRight" size={16} />
        </button>

        <p className="auth-switch">
          Already registered?{' '}
          <button className="auth-link" onClick={() => navigate('login')}>Sign in</button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
