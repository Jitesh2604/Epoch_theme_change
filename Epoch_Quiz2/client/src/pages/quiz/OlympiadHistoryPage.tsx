import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { useOlympiadAttempts } from '../../hooks/usePracticeQuiz';

interface Props { navigate: NavigateFn; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Attempted Olympiad — the logged-in student's own Olympiad attempt history. */
export const OlympiadHistoryPage: React.FC<Props> = ({ navigate }) => {
  const { data: attempts, loading, error } = useOlympiadAttempts();

  return (
    <div className="page-enter">
      <PageHead
        eyebrow={
          <button
            onClick={() => navigate('play')}
            style={{ background: 'transparent', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, padding: 0 }}
          >
            ← Categories
          </button>
        }
        title="Attempted Olympiad"
        body="Your previous Olympiad attempts."
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        {loading && <div style={{ color: 'var(--fg-3)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading your attempts…</div>}

        {!loading && error && (
          <div style={{ color: 'var(--danger)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>{error}</div>
        )}

        {!loading && !error && attempts && attempts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <Icon name="trophy" size={34} style={{ opacity: 0.35, marginBottom: 14 } as React.CSSProperties} />
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>No Olympiad attempts yet</h3>
            <p style={{ color: 'var(--fg-3)', fontSize: 14, marginBottom: 20 }}>Take your first Practice Olympiad to see it here.</p>
            <button className="btn btn-primary" onClick={() => navigate('olympiad')}>Start Practice Olympiad</button>
          </div>
        )}

        {!loading && !error && attempts && attempts.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {attempts.map(a => (
              <div key={a.attemptId} style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-soft, rgba(99,102,241,.12))', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="trophy" size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>
                    Attempt #{a.attemptNumber} · {a.quizTitle}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
                    {fmtDate(a.startTime)} · {a.questionCount} questions · {a.status === 'SUBMITTED' ? 'Completed' : 'In progress'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(a.percentage)}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    {a.correctAnswers}✓ · {a.wrongAnswers}✗ · {a.skipped}–
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-primary" style={{ justifySelf: 'start', marginTop: 8 }} onClick={() => navigate('olympiad')}>
              <Icon name="trophy" size={15} /> New Practice Olympiad
            </button>
          </div>
        )}
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
