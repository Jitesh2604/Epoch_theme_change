import React, { useState, useEffect, useCallback } from 'react';
import type { QuizResult, Tweaks } from './types';
import { NavBar, ToastStack } from './components';
import { LangContext } from './lib/i18n';
import type { Lang } from './lib/i18n';
import { TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakButton, useTweaks } from './tweaks/TweaksPanel';
import { HomePage } from './pages/home/HomePage';
import { QuizPlayPage } from './pages/quiz/QuizPlayPage';
import { CategoryPage } from './pages/quiz/CategoryPage';
import { LevelSelectPage } from './pages/quiz/LevelSelectPage';
import { QuizInterfacePage } from './pages/quiz/QuizInterfacePage';
import { OlympiadPlayPage } from './pages/quiz/OlympiadPlayPage';
import { OlympiadHistoryPage } from './pages/quiz/OlympiadHistoryPage';
import { ResultPage } from './pages/quiz/ResultPage';
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

const TWEAK_DEFAULTS: Tweaks = /*EDITMODE-BEGIN*/{
  quizLayout: 'split',
  optionStyle: 'card',
  catCardStyle: 'default',
  sliderStyle: 'split',
}/*EDITMODE-END*/;

function parseHash(): string {
  let h = window.location.hash || '#/home';
  if (h.startsWith('#')) h = h.slice(1);
  if (h.startsWith('/')) h = h.slice(1);
  return h || 'home';
}

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [theme, setTheme] = useState(() => localStorage.getItem('epoch-theme') ?? 'light');
  const [sfx, setSfx] = useState(() => localStorage.getItem('epoch-sfx') === '1');
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('epoch-lang') as Lang) ?? 'EN');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('epoch-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('epoch-sfx', sfx ? '1' : '0');
  }, [sfx]);

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

  const parts = route.split('/');
  const top = parts[0] || 'home';

  let page: React.ReactNode = null;

  if (top === 'home') {
    page = <HomePage navigate={navigate} tweaks={tweaks} />;
  } else if (top === 'play') {
    if (!getAuth()) {
      page = <PlayGate targetRoute={route} />;
    } else if (parts.length === 1) {
      page = <QuizPlayPage navigate={navigate} tweaks={tweaks} />;
    } else if (parts.length === 2) {
      page = <CategoryPage navigate={navigate} catId={parts[1]} tweaks={tweaks} />;
    } else if (parts.length === 4 && parts[3] === 'level') {
      page = <LevelSelectPage navigate={navigate} catId={parts[1]} subId={parts[2]} />;
    } else if (parts.length === 5 && parts[3] === 'quiz') {
      page = (
        <QuizInterfacePage
          navigate={navigate}
          catId={parts[1]}
          subId={parts[2]}
          level={parts[4]}
          tweaks={tweaks}
          sfx={sfx}
          setQuizResult={setQuizResult}
          key={parts.join('/')}
        />
      );
    } else if (parts.length === 4 && parts[3] === 'result') {
      page = <ResultPage navigate={navigate} result={quizResult} catId={parts[1]} subId={parts[2]} />;
    } else {
      page = <QuizPlayPage navigate={navigate} tweaks={tweaks} />;
    }
  } else if (top === 'olympiad') {
    if (!getAuth()) {
      page = <PlayGate targetRoute={route} />;
    } else if (parts[1] === 'history') {
      page = <OlympiadHistoryPage navigate={navigate} />;
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
      <TweaksPanel title="Tweaks">
        <TweakSection label="Hero slider">
          <TweakRadio
            label="Style"
            value={tweaks.sliderStyle}
            onChange={v => setTweaks('sliderStyle', v)}
            options={[
              { value: 'split',    label: 'Split'    },
              { value: 'centered', label: 'Centered' },
              { value: 'overlay',  label: 'Overlay'  },
            ]}
          />
        </TweakSection>
        <TweakSection label="Category cards">
          <TweakSelect
            label="Card style"
            value={tweaks.catCardStyle}
            onChange={v => setTweaks('catCardStyle', v)}
            options={[
              { value: 'default',  label: 'Default'  },
              { value: 'minimal',  label: 'Minimal'  },
              { value: 'gradient', label: 'Gradient' },
              { value: 'numbered', label: 'Numbered' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Quiz interface">
          <TweakRadio
            label="Layout"
            value={tweaks.quizLayout}
            onChange={v => setTweaks('quizLayout', v)}
            options={[
              { value: 'split',    label: 'Split'    },
              { value: 'centered', label: 'Centered' },
              { value: 'stack',    label: 'Stack'    },
            ]}
          />
          <TweakRadio
            label="Answer style"
            value={tweaks.optionStyle}
            onChange={v => setTweaks('optionStyle', v)}
            options={[
              { value: 'card', label: 'Cards' },
              { value: 'pill', label: 'Pills' },
              { value: 'tile', label: 'Tiles' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Jump to">
          <TweakButton label="→ Quiz play"  onClick={() => navigate('play')} />
          <TweakButton label="→ Home"       onClick={() => navigate('home')} secondary />
        </TweakSection>
      </TweaksPanel>
    </LangContext.Provider>
  );
}
