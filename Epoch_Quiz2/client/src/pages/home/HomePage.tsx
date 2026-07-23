import React, { useState, useEffect } from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { HERO_SLIDES } from '../../lib/data';
import { useT } from '../../lib/i18n';
import { useAuth, toUIRole } from '../../lib/authStore';
import { useAsync } from '../../hooks/useApi';
import { api } from '../../lib/api';

interface HomePageProps {
  navigate: NavigateFn;
  tweaks: Tweaks;
}

export const HomePage: React.FC<HomePageProps> = ({ navigate, tweaks }) => {
  const [slide, setSlide] = useState(0);
  const t = useT();
  const user = useAuth();
  const isStudent = !!user && toUIRole(user.role) === 'student';

  // Resolve which assessment the "Assessment" quick-start card should open —
  // an in-progress attempt resumes straight into the exam, otherwise it goes
  // to the current published assessment's Details page. Falls back to the
  // My Assessments list ('/assessment') for non-students, logged-out
  // visitors, or once there's more than one assessment to choose from.
  const { data: assessmentTarget } = useAsync<{ href: string } | null>(
    () => isStudent
      ? Promise.all([
          api.getWithQuery<{ items: { id: string }[] }>('/assessments', { status: 'PUBLISHED', limit: 1 }),
          api.getWithQuery<{ items: { id: string }[] }>('/submissions/me', { status: 'IN_PROGRESS', limit: 1 }),
        ]).then(([available, inProgress]) => {
          const resuming = inProgress.items[0];
          if (resuming) return { href: `/assessment/take/${resuming.id}` };
          const next = available.items[0];
          return { href: next ? `/assessment/${next.id}` : '/assessment' };
        })
      : Promise.resolve(null),
    [isStudent],
  );
  const assessmentHref = assessmentTarget?.href ?? '/assessment';

  useEffect(() => {
    const timer = setInterval(() => setSlide(s => (s + 1) % HERO_SLIDES.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const cur = HERO_SLIDES[slide];

  return (
    <div className="page-enter">
      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="hero" data-slider-style={tweaks.sliderStyle}>
            <div className="hero-slide" key={slide}>
              <div className="hero-text">
                <div className="eyebrow"><span className="dot"></span>{cur.eyebrow}</div>
                <h1 dangerouslySetInnerHTML={{ __html: cur.title }} />
                <p>{cur.body}</p>
                <div className="hero-actions">
                  <button
                    className="btn btn-primary lg"
                    onClick={() => { if (cur.ctaHref) window.location.href = cur.ctaHref; else navigate(cur.ctaRoute ?? 'play'); }}
                  >
                    {cur.cta} <Icon name="arrowRight" size={16} />
                  </button>
                  <button className="btn btn-ghost lg" onClick={() => navigate('faq')}>{t('home.howItWorks')}</button>
                </div>
              </div>
              <div className="hero-visual">
                <HeroIllustration variant={slide} />
              </div>
            </div>
          </div>
          <div className="hero-dots" role="tablist">
            {HERO_SLIDES.map((_, i) => (
              <button key={i} className={`hero-dot ${i === slide ? 'active' : ''}`} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} />
            ))}
          </div>
        </div>
      </section>

      {/* QUICK START */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head" style={{ marginBottom: 24 }}>
            <h2>{t('home.pickCategoryAndStart')}</h2>
          </div>

          <div className="cat-grid" data-card-style={tweaks.catCardStyle}>
            <button className="cat-card" onClick={() => navigate('play')}>
              <div className="cat-ico"><Icon name="trophy" size={20} /></div>
              <h3>Practice Olympiad</h3>
              <p>Pick a subject and difficulty, and practice at your own pace — instant results every time.</p>
              <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
            </button>
            <button className="cat-card" onClick={() => { window.location.href = assessmentHref; }}>
              <div className="cat-ico"><Icon name="fileText" size={20} /></div>
              <h3>Assessment</h3>
              <p>A timed, official Assessment set by your school — reviewed and results published by your Admin.</p>
              <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
            </button>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow"><span className="dot"></span>{t('home.whyChooseUs')}</div>
            <h2>Everything organized the way students actually study.</h2>
            <p>Every question is tagged to a subject, difficulty, class, and education board — so what you practice always matches your curriculum.</p>
          </div>
          <div className="grid-3">
            {[
              { ic: 'layers',     t: 'Subject-wise Practice', d: 'Pick one subject and difficulty for focused, timed practice, or take on a self-paced mixed Practice Olympiad set across all your subjects.' },
              { ic: 'pause',      t: 'Pause & Resume',        d: 'Step away mid-practice and pick up right where you left off — your answers and timer are saved automatically.' },
              { ic: 'bolt',       t: 'Instant Practice Results', d: 'Score, correct answers, and worked explanations the moment you submit a Practice or Olympiad attempt.' },
              { ic: 'fileText',   t: 'Official Assessment Mode', d: 'One timed assessment per session, taken in a distraction-free, full-screen exam experience.' },
              { ic: 'clock',      t: 'Results Published by Your School', d: 'Assessment results aren’t instant — they’re reviewed and officially published by your admin once grading is complete.' },
              { ic: 'graduation', t: 'Curriculum-based Question Bank', d: 'Every question is tagged to a subject, difficulty, class, and education board, so what you practice always matches your syllabus.' },
            ].map((f, i) => (
              <div key={i} className="feature">
                <div className="f-ico"><Icon name={f.ic} size={20} /></div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INCREDIBLE FEATURES */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <div className="eyebrow"><span className="dot"></span>Built for real practice</div>
            <h2>The little things that make the difference.</h2>
            <p>Not just another quiz page — these are the details that make practice actually useful.</p>
          </div>
          <div className="grid-3">
            {[
              { ic: 'rocket',  t: 'Know before you start',       d: 'Every Assessment and Practice Olympiad opens with a clear overview — subject, marks, duration, and instructions — before you begin.' },
              { ic: 'clock',   t: 'Timed Practice Sessions',      d: 'Subject Practice runs on a difficulty-based timer, so you build real exam pace. Practice Olympiad stays untimed, for pressure-free review.' },
              { ic: 'chart',   t: 'Detailed Practice Analytics',  d: 'Every Practice and Olympiad attempt gives you a full per-question breakdown — accuracy, time taken, and what you got right, wrong, or skipped.' },
            ].map((f, i) => (
              <div key={i} className="feature animated">
                <div className="f-ico"><Icon name={f.ic} size={20} /></div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEST PART */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="best-part">
            <div>
              <div className="eyebrow"><span className="dot"></span>The best part</div>
              <h2 style={{ marginTop: 12 }}>It feels less like a quiz app, more like a sparring partner.</h2>
              <div className="checks">
                {[
                  { t: 'Three difficulty levels',      d: 'Tune to your morning brain or your sharpest hour — easy, medium, hard.' },
                  { t: 'Two ways to prepare',           d: 'Practice Olympiad for self-paced learning, Attempt Olympiad for a graded, timed set.' },
                  { t: 'Exam integrity, built in',      d: 'No answer feedback during an Assessment, and no way to leave once you’ve started — official results stay fair.' },
                  { t: 'Built-in dark & light themes', d: 'OLED-tuned dark mode for late nights. Warm off-white for daylight.' },
                ].map((c, i) => (
                  <div key={i} className="check">
                    <div className="c-ico"><Icon name="check" size={12} strokeWidth={3} /></div>
                    <div className="check-text"><strong>{c.t}</strong><p>{c.d}</p></div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={() => navigate('play')}>{t('home.startAQuiz')} <Icon name="arrowRight" size={14} /></button>
                <button className="btn btn-ghost" onClick={() => navigate('about')}>{t('home.aboutEpoch')}</button>
              </div>
            </div>
            <div className="stat-grid">
              {[
                { n: '3',  l: 'Ways to prepare — Subject Practice, Olympiad, Assessment' },
                { n: '3',  l: 'Difficulty levels'         },
                { n: '0',  l: 'Time pressure in Practice Olympiad' },
                { n: '1',  l: 'Official assessment per session' },
              ].map((s, i) => (
                <div key={i} className="stat">
                  <div className="s-num">{s.n}</div>
                  <div className="s-lbl">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};

const HeroIllustration: React.FC<{ variant?: number }> = ({ variant = 0 }) => {
  if (variant === 1) {
    return (
      <svg viewBox="0 0 480 380" style={{ width: '90%', height: '90%' }} fill="none">
        <defs>
          <linearGradient id="hg1" x1="0" y1="0" x2="480" y2="380" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#354024"/><stop offset="1" stopColor="#889063"/>
          </linearGradient>
        </defs>
        {/* Leaderboard bars */}
        <rect x="90" y="228" width="110" height="110" rx="12" fill="rgba(136,144,99,0.15)" stroke="#889063" strokeWidth="1.5"/>
        <text x="145" y="296" textAnchor="middle" fontSize="32" fontWeight="700" fontFamily="Lora,Georgia,serif" fill="#889063">2</text>
        <rect x="185" y="178" width="110" height="160" rx="12" fill="rgba(53,64,36,0.12)" stroke="#354024" strokeWidth="1.5"/>
        <text x="240" y="278" textAnchor="middle" fontSize="32" fontWeight="700" fontFamily="Lora,Georgia,serif" fill="#354024">1</text>
        <rect x="280" y="258" width="110" height="80" rx="12" fill="rgba(207,187,153,0.20)" stroke="#CFBB99" strokeWidth="1.5"/>
        <text x="335" y="308" textAnchor="middle" fontSize="32" fontWeight="700" fontFamily="Lora,Georgia,serif" fill="#8A6F35">3</text>
        {/* Trophy */}
        <path d="M212 105 L268 105 L268 148 Q268 166 240 166 Q212 166 212 148 Z" fill="url(#hg1)"/>
        <path d="M212 118 Q198 118 198 134 Q198 150 212 150" stroke="#354024" strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
        <path d="M268 118 Q282 118 282 134 Q282 150 268 150" stroke="#354024" strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
        <rect x="237" y="166" width="6" height="12" fill="#4A5A32"/>
        <rect x="227" y="178" width="26" height="4" rx="2" fill="#4A5A32"/>
        <text x="240" y="141" textAnchor="middle" fontSize="20" fill="white" opacity="0.9">★</text>
        {/* Score pills */}
        <rect x="92" y="200" width="106" height="24" rx="12" fill="rgba(136,144,99,0.18)" stroke="#889063" strokeWidth="1"/>
        <rect x="104" y="208" width="82" height="8" rx="4" fill="#4A5A32" opacity="0.55"/>
        <rect x="282" y="230" width="106" height="24" rx="12" fill="rgba(207,187,153,0.22)" stroke="#CFBB99" strokeWidth="1"/>
        <rect x="294" y="238" width="82" height="8" rx="4" fill="#6B5525" opacity="0.55"/>
        {/* Decorative dots */}
        <circle cx="170" cy="82" r="4" fill="#354024" opacity="0.35"/>
        <circle cx="310" cy="88" r="3" fill="#889063" opacity="0.40"/>
        <circle cx="80" cy="180" r="3" fill="#CFBB99" opacity="0.55"/>
        <circle cx="410" cy="200" r="3" fill="#889063" opacity="0.35"/>
        <circle cx="420" cy="140" r="2" fill="#354024" opacity="0.30"/>
        <circle cx="60" cy="300" r="2.5" fill="#CFBB99" opacity="0.45"/>
      </svg>
    );
  }
  if (variant === 2) {
    return (
      <svg viewBox="0 0 480 380" style={{ width: '90%', height: '90%' }} fill="none">
        <defs>
          <linearGradient id="hg2" x1="0" y1="0" x2="480" y2="380" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#354024"/><stop offset="1" stopColor="#889063"/>
          </linearGradient>
        </defs>
        {/* Score circle */}
        <circle cx="240" cy="168" r="108" stroke="rgba(53,64,36,0.10)" strokeWidth="2"/>
        <circle cx="240" cy="168" r="90" stroke="url(#hg2)" strokeWidth="10"
                strokeLinecap="round" strokeDasharray="497 565"
                fill="none" transform="rotate(-90 240 168)"/>
        <circle cx="240" cy="168" r="74" fill="rgba(53,64,36,0.04)" stroke="rgba(53,64,36,0.12)" strokeWidth="1"/>
        <text x="240" y="164" textAnchor="middle" fontSize="30" fontWeight="700" fontFamily="Lora,Georgia,serif" fill="#354024">?</text>
        <text x="240" y="188" textAnchor="middle" fontSize="10" letterSpacing="2.5" fill="rgba(76,61,25,0.50)" fontFamily="Inter,sans-serif">SCORE</text>
        {/* Stars */}
        <text x="198" y="310" fontSize="26" fill="#B45309" opacity="0.80">★</text>
        <text x="230" y="316" fontSize="32" fill="#354024">★</text>
        <text x="266" y="310" fontSize="26" fill="#B45309" opacity="0.80">★</text>
        {/* Stat cards */}
        <rect x="48" y="288" width="114" height="50" rx="10" fill="rgba(53,64,36,0.06)" stroke="rgba(53,64,36,0.20)" strokeWidth="1.5"/>
        <text x="105" y="306" textAnchor="middle" fontSize="9" letterSpacing="1.2" fill="rgba(76,61,25,0.50)" fontFamily="Inter,sans-serif">CORRECT</text>
        <rect x="80" y="316" width="50" height="10" rx="5" fill="#354024" opacity="0.30"/>
        <rect x="318" y="288" width="114" height="50" rx="10" fill="rgba(136,144,99,0.10)" stroke="rgba(136,144,99,0.28)" strokeWidth="1.5"/>
        <text x="375" y="306" textAnchor="middle" fontSize="9" letterSpacing="1.2" fill="rgba(76,61,25,0.45)" fontFamily="Inter,sans-serif">AVG TIME</text>
        <rect x="350" y="316" width="50" height="10" rx="5" fill="#889063" opacity="0.35"/>
        {/* Dots */}
        <circle cx="76" cy="96" r="4" fill="#354024" opacity="0.30"/>
        <circle cx="412" cy="112" r="3" fill="#889063" opacity="0.35"/>
        <circle cx="54" cy="220" r="2.5" fill="#CFBB99" opacity="0.50"/>
        <circle cx="436" cy="248" r="2.5" fill="#889063" opacity="0.35"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 480 380" style={{ width: '90%', height: '90%' }} fill="none">
      <defs>
        <linearGradient id="hg0" x1="0" y1="0" x2="480" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#354024"/><stop offset="1" stopColor="#4A5A32"/>
        </linearGradient>
      </defs>
      {/* Quiz card */}
      <rect x="52" y="32" width="376" height="316" rx="16" fill="rgba(53,64,36,0.04)" stroke="rgba(53,64,36,0.18)" strokeWidth="1.5"/>
      <rect x="52" y="32" width="376" height="64" rx="16" fill="url(#hg0)"/>
      <rect x="52" y="76" width="376" height="20" fill="url(#hg0)"/>
      {/* Header elements */}
      <circle cx="96" cy="64" r="20" fill="rgba(255,255,255,0.18)"/>
      <text x="96" y="72" textAnchor="middle" fontSize="18" fontWeight="700" fontFamily="Lora,Georgia,serif" fill="white">?</text>
      <text x="128" y="59" fontSize="10" letterSpacing="1.5" fill="rgba(255,255,255,0.65)" fontFamily="Inter,sans-serif">QUESTION</text>
      <text x="128" y="76" fontSize="15" fontWeight="600" fontFamily="Inter,sans-serif" fill="white">03 of 10</text>
      <rect x="368" y="44" width="48" height="28" rx="14" fill="rgba(255,255,255,0.18)"/>
      <text x="392" y="62" textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="Inter,sans-serif" fill="white">0:28</text>
      {/* Answer A — selected */}
      <rect x="72" y="124" width="336" height="52" rx="12" fill="rgba(53,64,36,0.10)" stroke="#354024" strokeWidth="2"/>
      <circle cx="100" cy="150" r="14" fill="#354024"/>
      <text x="100" y="155" textAnchor="middle" fontSize="13" fontWeight="700" fontFamily="Inter,sans-serif" fill="white">A</text>
      <rect x="126" y="143" width="180" height="10" rx="5" fill="rgba(44,30,8,0.20)"/>
      <circle cx="376" cy="150" r="9" fill="#354024" opacity="0.85"/>
      <path d="M371 150 l4 4 l7-8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Answer B */}
      <rect x="72" y="188" width="336" height="52" rx="12" fill="rgba(53,64,36,0.03)" stroke="rgba(53,64,36,0.18)" strokeWidth="1.5"/>
      <circle cx="100" cy="214" r="14" stroke="#889063" strokeWidth="1.5" fill="none"/>
      <text x="100" y="219" textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="Inter,sans-serif" fill="#889063">B</text>
      <rect x="126" y="207" width="140" height="10" rx="5" fill="rgba(53,64,36,0.10)"/>
      {/* Answer C */}
      <rect x="72" y="250" width="336" height="52" rx="12" fill="rgba(53,64,36,0.03)" stroke="rgba(53,64,36,0.18)" strokeWidth="1.5"/>
      <circle cx="100" cy="276" r="14" stroke="#889063" strokeWidth="1.5" fill="none"/>
      <text x="100" y="281" textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="Inter,sans-serif" fill="#889063">C</text>
      <rect x="126" y="269" width="160" height="10" rx="5" fill="rgba(53,64,36,0.08)"/>
      {/* Dots */}
      <circle cx="34" cy="120" r="4" fill="#354024" opacity="0.25"/>
      <circle cx="454" cy="200" r="3" fill="#889063" opacity="0.35"/>
      <circle cx="28" cy="270" r="2.5" fill="#CFBB99" opacity="0.50"/>
      <circle cx="460" cy="100" r="2" fill="#889063" opacity="0.40"/>
    </svg>
  );
};
