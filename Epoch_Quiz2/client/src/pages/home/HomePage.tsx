import React, { useState, useEffect } from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { HERO_SLIDES } from '../../lib/data';
import { useT } from '../../lib/i18n';
import { useCategories } from '../../hooks/useCategories';

interface HomePageProps {
  navigate: NavigateFn;
  tweaks: Tweaks;
}

export const HomePage: React.FC<HomePageProps> = ({ navigate, tweaks }) => {
  const [slide, setSlide] = useState(0);
  const t = useT();
  const { data: categories, loading, error } = useCategories();

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
                  <button className="btn btn-primary lg" onClick={() => navigate('play')}>
                    {cur.cta} <Icon name="arrowRight" size={16} />
                  </button>
                  <button className="btn btn-ghost lg" onClick={() => navigate('instruction')}>{t('home.howItWorks')}</button>
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 12, color: 'var(--fg-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  <span>{t('home.freeTrial')}</span>
                  <span>{t('home.noCard')}</span>
                  <span>{t('home.cancelAnytime')}</span>
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
            {loading && <div className="text-fg3 text-[13px]">Loading categories…</div>}
            {error && <div className="text-danger text-[13px]">Unable to load categories.</div>}
            {!loading && !error && categories?.map((category) => (
              <button
                key={category.id}
                className="cat-card"
                onClick={() => {
                  if (category.slug === 'practice-olympiad') {
                    // The real mixed-subject Olympiad flow — matches this
                    // card's own description below.
                    navigate('olympiad');
                  } else if (category.slug === 'attempted-olympiad') {
                    // Assessments live in the Student Dashboard (a separate SPA
                    // mounted at /student/*), so this is a real navigation, not
                    // the marketing site's internal hash-route navigate().
                    window.location.href = '/student/assessments';
                  }
                }}
              >
                <div className="cat-ico"><Icon name={category.slug === 'practice-olympiad' ? 'trophy' : 'fileText'} size={20} /></div>
                <h3>{category.name}</h3>
                <p>{category.slug === 'practice-olympiad' ? 'Start a mixed Olympiad quiz across your selected subjects.' : 'Attempt assessments assigned to your class.'}</p>
                <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow"><span className="dot"></span>{t('home.whyChooseUs')}</div>
            <h2>Built on the same workspace publishers already trust.</h2>
            <p>Olympaid Epoch Quiz inherits the question-bank infrastructure our editorial team already uses — reviewed content, taxonomy tags, and curriculum-board tagging built in.</p>
          </div>
          <div className="grid-3">
            {[
              { ic: 'bolt',       t: 'Instant results',      d: 'Your score, correct answers, and full explanations the moment you submit — no waiting.' },
              { ic: 'shield',     t: 'Editorially reviewed',  d: 'Every question is authored and reviewed by our editorial team before it reaches students.' },
              { ic: 'trophy',     t: 'Real leaderboards',     d: 'Graded assessments feed a live leaderboard. Updates the instant results are in.' },
              { ic: 'chart',      t: 'Clear results',         d: 'Score, accuracy, and a full per-question breakdown after every attempt — the numbers that actually help.' },
              { ic: 'layers',     t: 'Practice, Olympiad, and Assessments', d: 'Subject Practice for focused study, Practice Olympiad for a mixed challenge, and school-assigned Assessments — all in one place.' },
              { ic: 'graduation', t: 'Curriculum-aligned',    d: 'Tagged to CBSE, IB, Cambridge, and major state boards out of the box.' },
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
            <div className="eyebrow"><span className="dot"></span>Incredible features</div>
            <h2>The little things that make the difference.</h2>
            <p>Quiz software is everywhere. The details below are the things you can&apos;t fake — and the reason teams keep coming back.</p>
          </div>
          <div className="grid-3">
            {[
              { ic: 'rocket',  t: 'Know before you start',  d: 'Every Assessment and Practice Olympiad opens with a clear overview — subject, marks, duration, and instructions — before you begin.' },
              { ic: 'brain',   t: 'Explanations included',  d: 'Many questions come with a worked explanation, so a wrong answer still teaches you something.' },
              { ic: 'refresh', t: 'Full result breakdown',  d: 'See exactly what you got right, wrong, or skipped — with accuracy, timing, and a question-by-question review.' },
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
                  { t: 'Two quiz modes',                  d: 'Practice Olympaid for self-paced learning, Attempt Olympaid for graded results.' },
                  { t: 'Timer modes that respect you', d: 'Linear bar, digital clock, or radial ring. Or turn it off entirely for practice runs.' },
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
                { n: '3',  l: 'Ways to practice — Subject, Olympiad, Assessments' },
                { n: '3',  l: 'Difficulty levels'         },
                { n: '0',  l: 'Time pressure in Practice modes' },
                { n: '1',  l: 'Live leaderboard, updated instantly' },
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
