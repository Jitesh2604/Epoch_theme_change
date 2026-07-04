import React, { useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { api, ApiError } from '../../lib/api';

// The single source of truth for contact details shown on the page.
const CONTACT = {
  email: 'mayank@epochstudio.net',
  phones: ['9711146828', '9818073878'],
  address: ['H-962-C, Top Floor,', 'Street No. 10,', 'Sector 7, Dwarka,', 'Near Ramphal Chowk,', 'New Delhi - 110046'],
};

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
      title: 'Get in touch.',
      body: "Questions, feedback, or partnership enquiries — send us a note and we'll get back to you.",
      sections: [],
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
        {kind === 'contact' ? (
          <ContactSection />
        ) : (
          <div className="prose">
            {c.sections.map((s, i) => (
              <div key={i}><h2>{s.h}</h2><p>{s.p}</p></div>
            ))}
          </div>
        )}
      </section>
      <Footer navigate={navigate} />
    </div>
  );
};

// ── Contact section: info cards + working form ──────────────────────────────

const InfoCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="feature">
    <div className="f-ico"><Icon name={icon} size={20} /></div>
    <h3>{title}</h3>
    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)' }}>{children}</div>
  </div>
);

const ContactSection: React.FC = () => (
  <div style={{ display: 'grid', gap: 24 }}>
    <div className="grid-3">
      <InfoCard icon="mail" title="Email">
        <a href={`mailto:${CONTACT.email}`} style={{ color: 'var(--brand, #354024)', wordBreak: 'break-all' }}>
          {CONTACT.email}
        </a>
      </InfoCard>

      <InfoCard icon="phone" title="Phone">
        {CONTACT.phones.map(p => (
          <div key={p}>
            <a href={`tel:+91${p}`} style={{ color: 'var(--fg-1)' }}>{p}</a>
          </div>
        ))}
      </InfoCard>

      <InfoCard icon="mapPin" title="Office address">
        {CONTACT.address.map((line, i) => <div key={i}>{line}</div>)}
      </InfoCard>
    </div>

    <div style={{ padding: 24, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-xl)' }}>
      <h2 style={{ margin: '0 0 4px' }}>Send us a message</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--fg-3)' }}>
        Fill in the form and we'll get back to you.
      </p>
      <ContactForm />
    </div>
  </div>
);

const ContactForm: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, subject, message } = form;
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      showToast('Please fill in all fields.', 'danger');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      showToast('Please enter a valid email address.', 'danger');
      return;
    }

    setSending(true);
    try {
      // Real backend send — throws on failure (no fake success).
      await api.post('/contact', {
        name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim(),
      });
      showToast("Message sent — we'll get back to you soon.", 'success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not send your message. Please try again.';
      showToast(msg, 'danger');
    } finally {
      setSending(false);
    }
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
        <input style={inputStyle} placeholder="Your name"   value={form.name}  onChange={set('name')} />
        <input style={inputStyle} placeholder="Email"        value={form.email} onChange={set('email')} type="email" />
      </div>
      <input style={inputStyle} placeholder="Subject" value={form.subject} onChange={set('subject')} />
      <textarea
        style={{ ...inputStyle, minHeight: 130, resize: 'vertical' }}
        placeholder="Your message…"
        value={form.message}
        onChange={set('message')}
      />
      <div>
        <button className="btn btn-primary" type="submit" disabled={sending}>
          {sending ? 'Sending…' : <>Send message <Icon name="arrowRight" size={14} /></>}
        </button>
      </div>
    </form>
  );
};
