import React, { useState, useEffect, useCallback } from 'react';
import type { Tweaks } from './types';
import { NavBar, ToastStack } from './components';
import { LangContext } from './lib/i18n';
import type { Lang } from './lib/i18n';
import { HomePage } from './pages/home/HomePage';
import { QuizPlayPage } from './pages/quiz/QuizPlayPage';
import { PracticePlayPage } from './pages/quiz/PracticePlayPage';
import { PracticeResultPage } from './pages/quiz/PracticeResultPage';
import { OlympiadPlayPage } from './pages/quiz/OlympiadPlayPage';
import { InstructionPage } from './pages/static/InstructionPage';
import { StaticPage } from './pages/static/StaticPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { CompleteProfilePage } from './pages/auth/CompleteProfilePage';
import { CompleteProfileStudentPage } from './pages/auth/CompleteProfileStudentPage';
import { CompleteProfileTeacherPage } from './pages/auth/CompleteProfileTeacherPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { getAuth } from './dashboards/shared/auth';
import { refreshSession, getRefreshToken } from './lib/authStore';
import { showToast } from './components/ui/Toast';

function PlayGate({ targetRoute }: { targetRoute: string }) {
  useEffect(() => {
    localStorage.setItem('epoch-after-auth', '#/' + targetRoute);
    showToast('Please sign up to play quizzes', 'success');
    const t = setTimeout(() => { window.location.hash = '#/signup'; }, 350);
    return () => clearTimeout(t);
  }, [targetRoute]);
  return (
    <div style={{ maxWidth: 420, margin: '120px auto', padding: '0 24px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8, color: 'var(--fg-1)' }}>
        Sign up to play
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.6 }}>
        Quizzes are for signed-in students and teachers. Redirecting you to sign up — you'll come right back here.
      </p>
    </div>
  );
}

const TWEAK_DEFAULTS: Tweaks = {
  catCardStyle: 'default',
  sliderStyle: 'split',
};

function parseHash(): string {
  let h = window.location.hash || '#/home';
  if (h.startsWith('#')) h = h.slice(1);
  if (h.startsWith('/')) h = h.slice(1);
  return h || 'home';
}

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [theme, setTheme] = useState(() => localStorage.getItem('epoch-theme') ?? 'light');
  const tweaks = TWEAK_DEFAULTS;
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('epoch-lang') as Lang) ?? 'EN');

  // Restore the in-memory access token from the persisted refresh token before
  // rendering. The marketing-site pages (Play / Olympiad) call authenticated
  // endpoints; without this bootstrap the access token is null after any reload
  // or direct navigation, so every request fires without an Authorization header
  // → 401. Mirrors DashboardApp's session restore. Public visitors (no refresh
  // token) render immediately with no delay.
  const [sessionReady, setSessionReady] = useState(() => !getRefreshToken());
  useEffect(() => {
    if (!getRefreshToken()) return;
    refreshSession()
      .catch(() => { /* clearTokens already called inside refreshSession */ })
      .finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('epoch-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('epoch-lang', lang);
  }, [lang]);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = '#/' + path;
  }, []);

  // Hold render until the session is restored so authenticated pages don't fire
  // API calls before the access token is set.
  if (!sessionReady) return null;

  const parts = route.split('/');
  const top = parts[0] || 'home';

  let page: React.ReactNode = null;

  if (top === 'home') {
    page = <HomePage navigate={navigate} tweaks={tweaks} />;
  } else if (top === 'play') {
    if (!getAuth()) {
      page = <PlayGate targetRoute={route} />;
    } else if (parts[1] === 'quiz' && parts[2]) {
      page = <PracticePlayPage navigate={navigate} attemptId={parts[2]} />;
    } else if (parts[1] === 'result' && parts[2]) {
      page = <PracticeResultPage navigate={navigate} attemptId={parts[2]} />;
    } else {
      // The whole Practice Olympiad flow — subject selection, difficulty,
      // quiz overview, quiz, and results — lives entirely under /play and
      // its child routes (play/quiz/:id, play/result/:id). None of it ever
      // touches /student/practice or the Student Dashboard.
      page = <QuizPlayPage navigate={navigate} />;
    }
  } else if (top === 'olympiad') {
    if (!getAuth()) {
      page = <PlayGate targetRoute={route} />;
    } else if (parts[1] === 'history') {
      // Quiz/Olympiad results now live in the Student Dashboard's Results
      // page, not on the marketing site.
      window.location.href = '/student/results';
      page = null;
    } else if (parts[1]) {
      // #/olympiad/:attemptId — resuming a specific paused attempt from
      // "Resume Paused Quizzes", as opposed to bare #/olympiad (Attempt
      // Olympiad), which always starts a brand-new mixed quiz.
      page = <OlympiadPlayPage navigate={navigate} resumeAttemptId={parts[1]} />;
    } else {
      page = <OlympiadPlayPage navigate={navigate} />;
    }
  } else if (top === 'instruction') {
    page = <InstructionPage navigate={navigate} />;
  } else if (['about', 'contact', 'privacy', 'terms'].includes(top)) {
    page = <StaticPage navigate={navigate} kind={top} />;
  } else if (top === 'login') {
    page = <LoginPage navigate={navigate} />;
  } else if (top === 'signup') {
    page = <SignupPage navigate={navigate} />;
  } else if (top === 'complete-profile') {
    if (parts[1] === 'student')      page = <CompleteProfileStudentPage navigate={navigate} />;
    else if (parts[1] === 'teacher') page = <CompleteProfileTeacherPage navigate={navigate} />;
    else                             page = <CompleteProfilePage navigate={navigate} />;
  } else if (top === 'forgot-password') {
    page = <ForgotPasswordPage navigate={navigate} />;
  } else if (top === 'reset-password') {
    page = <ResetPasswordPage navigate={navigate} token={parts[1] ?? ''} />;
  } else {
    page = <HomePage navigate={navigate} tweaks={tweaks} />;
  }

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <div className="aurora" />
      <NavBar route={route} navigate={navigate} />
      <main>{page}</main>
      <ToastStack />
    </LangContext.Provider>
  );
}
