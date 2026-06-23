import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';

type StaticKind = 'about' | 'contact' | 'privacy' | 'terms';

interface StaticPageProps {
  navigate: NavigateFn;
  kind: string;
}

interface StaticContent {
  eyebrow: string;
  title: string;
  body: string;
  sections: { h: string; p: string }[];
}

export const StaticPage: React.FC<StaticPageProps> = ({ navigate, kind }) => {
  const content: Record<StaticKind, StaticContent> = {
    about: {
      eyebrow: 'About us',
      title: 'A quiz workspace built by educational publishers.',
      body: 'We make the tools we wish we had when we were authoring textbooks and worksheets at scale.',
      sections: [
        { h: 'What we make',    p: 'Olympaid Epoch Quiz is part of the Epoch GPT AI workspace — the same backbone that powers chat-with-book, lesson-plan generation, answer-key creation, and full test-paper authoring. Quiz is the consumer-facing mode of that engine.' },
        { h: 'Who we are',      p: "A small team of editors, learning designers, and engineers based across Bangalore, London, and New York. We've shipped curriculum-aligned tools at NCERT, Cambridge, and three large state boards." },
        { h: 'Why we built this', p: "Because every quiz app we'd used either felt like a consumer game or a corporate LMS. We wanted one that respects the audience: students, teachers, and editorial teams who treat learning seriously." },
      ],
    },
    contact: {
      eyebrow: 'Contact us',
      title: "Let's talk.",
      body: 'We answer every message within one working day. Pick the channel that suits you.',
      sections: [
        { h: 'Email',               p: 'hello@epoch.ai — for general questions, partnership enquiries, and bug reports.' },
        { h: 'Editorial enquiries', p: "editorial@epoch.ai — if you'd like to license content, contribute questions, or join the editorial board." },
        { h: 'Press',               p: 'press@epoch.ai — for media kits, founder availability, and embargoed releases.' },
        { h: 'Office',              p: 'Epoch Inc. · 4th floor, 22 Mercer Street, London WC2H 9HD' },
      ],
    },
    privacy: {
      eyebrow: 'Privacy policy',
      title: 'How we handle your data.',
      body: 'The short version: we collect the minimum we need to give you a quiz experience, never sell it, and let you delete it any time.',
      sections: [
        { h: 'What we collect',        p: "Account info (name, email), quiz history (scores and answers), and basic analytics (device type, anonymised usage). That's it." },
        { h: 'What we do not collect', p: 'We do not track you across the web, build advertising profiles, or share data with third-party advertisers. There is no third-party advertising network on Olympaid Epoch Quiz.' },
        { h: 'Your rights',            p: 'You can export all your data or delete your account at any time from Settings. Deletes are permanent within 30 days. We are GDPR, FERPA, and India DPDP compliant.' },
        { h: 'Cookies',                p: 'We use a minimal set of first-party cookies for authentication and remembering your preferences. No third-party tracking cookies.' },
      ],
    },
    terms: {
      eyebrow: 'Terms & conditions',
      title: 'The agreement between you and us.',
      body: 'Standard terms — readable, enforceable, no surprises.',
      sections: [
        { h: 'Your account',     p: "One account per person. You're responsible for what happens on it. Tell us within 24 hours if you suspect it's compromised." },
        { h: 'Acceptable use',   p: "Use Olympaid Epoch Quiz for learning, teaching, or evaluation. Don't scrape it, reverse-engineer it, or use it to harass others." },
        { h: 'Content ownership', p: 'You own the content you create. We own the platform and the curated question banks. Licensed content is marked as such.' },
        { h: 'Termination',      p: 'Either party can end the agreement with 30 days notice. We can suspend an account immediately for violations of acceptable use.' },
        { h: 'Liability',        p: 'Standard SaaS liability caps — see the full version on request from legal@epoch.ai.' },
      ],
    },
  };

  const c = content[kind as StaticKind] ?? content.about;

  return (
    <div className="page-enter">
      <PageHead eyebrow={c.eyebrow} title={c.title} body={c.body} />
      <section className="container" style={{ paddingBottom: 80 }}>
        <div className="prose">
          {c.sections.map((s, i) => (
            <div key={i}><h2>{s.h}</h2><p>{s.p}</p></div>
          ))}
          {kind === 'contact' && (
            <div style={{ marginTop: 32, padding: 24, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-xl)' }}>
              <h2 style={{ margin: '0 0 12px' }}>Drop us a note</h2>
              <ContactForm />
            </div>
          )}
        </div>
      </section>
      <Footer navigate={navigate} />
    </div>
  );
};

const ContactForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !msg) { showToast('Fill in all three fields, please.', 'danger'); return; }
    showToast("Sent. We'll reply within one working day.");
    setName(''); setEmail(''); setMsg('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg)', border: '1px solid var(--border-1)',
    borderRadius: 10, color: 'var(--fg-1)', fontSize: 14,
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <input style={inputStyle} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
        <input style={inputStyle} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} placeholder="What's on your mind?" value={msg} onChange={e => setMsg(e.target.value)} />
      <div>
        <button className="btn btn-primary" type="submit">Send message <Icon name="arrowRight" size={14} /></button>
      </div>
    </form>
  );
};
