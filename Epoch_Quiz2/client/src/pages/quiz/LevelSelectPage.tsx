import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { QUIZ_CATEGORIES, LEVELS } from '../../lib/data';
import { usePracticeSubjects } from '../../hooks/usePracticeQuiz';
import { useT } from '../../lib/i18n';

interface LevelSelectPageProps {
  navigate: NavigateFn;
  catId: string;
  subId: string;
}

export const LevelSelectPage: React.FC<LevelSelectPageProps> = ({ navigate, catId, subId }) => {
  const t = useT();
  const cat = QUIZ_CATEGORIES.find(c => c.id === catId);
  const { data: subjects, loading } = usePracticeSubjects();
  const subject = subjects?.find(s => s.id === subId);

  if (!cat) {
    return (
      <div className="container" style={{ padding: 80 }}>
        <h2>{t('common.categoryNotFound')}</h2>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('play')}>
          {t('common.backToQuizPlay')}
        </button>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHead
        eyebrow={
          <>
            <button
              onClick={() => navigate('play')}
              style={{ background: 'transparent', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, padding: 0 }}
            >
              {t('cat.backToQuizPlay')}
            </button>
            <span style={{ color: 'var(--fg-3)' }}> / </span>
            <button
              onClick={() => navigate(`play/${cat.id}`)}
              style={{ background: 'transparent', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, padding: 0 }}
            >
              {cat.title}
            </button>
            <span style={{ color: 'var(--fg-3)' }}> / </span>
            {loading ? '…' : (subject?.name ?? subId)}
          </>
        }
        title={t('level.pickDifficulty')}
        body={
          loading
            ? '…'
            : subject
              ? <>{subject.name} <span style={{ color: 'var(--fg-3)' }}>· {subject.questionCount} {t('cat.questions')} in bank</span></>
              : t('level.pickDifficulty')
        }
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        <div className="grid-3">
          {LEVELS.map(L => (
            <button
              key={L.id}
              className="level-card"
              data-level={L.id}
              onClick={() => navigate(`play/${cat.id}/${subId}/quiz/${L.id}`)}
            >
              <div className="level-bars">
                <span className="level-bar" />
                <span className="level-bar" />
                <span className="level-bar" />
              </div>
              <h3>{t(`level.${L.id}.title`)}</h3>
              <p>{t(`level.${L.id}.desc`)}</p>
              <div className="level-meta">
                <Icon name="fileText" size={12} /> {L.questions} {t('level.questions')}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 32, padding: 20, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon name="info" size={18} style={{ color: 'var(--brand)', flexShrink: 0 } as React.CSSProperties} />
          <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
            {t('level.info')}
          </div>
        </div>
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
