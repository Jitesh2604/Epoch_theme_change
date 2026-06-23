import React from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { QUIZ_CATEGORIES } from '../../lib/data';
import { usePracticeSubjects } from '../../hooks/usePracticeQuiz';
import { useT } from '../../lib/i18n';

interface CategoryPageProps {
  navigate: NavigateFn;
  catId: string;
  tweaks: Tweaks;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ navigate, catId, tweaks }) => {
  const t = useT();
  const cat = QUIZ_CATEGORIES.find(c => c.id === catId);
  const { data: subjects, loading, error } = usePracticeSubjects();

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
            {' '}<span style={{ color: 'var(--fg-3)' }}>/</span>{' '}
            {cat.title}
          </>
        }
        title={<>{cat.title}<span style={{ color: 'var(--fg-3)', fontWeight: 400 }}> · {t('cat.topics')}</span></>}
        body={cat.blurb}
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        {loading && (
          <div className="cat-grid" data-card-style={tweaks.catCardStyle}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="assess-skel" style={{ height: 160 }} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-3)' }}>
            <Icon name="info" size={28} style={{ marginBottom: 12, color: 'var(--danger)' } as React.CSSProperties} />
            <p style={{ fontSize: 14 }}>Could not load subjects. Please try again.</p>
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => navigate('play')}>
              {t('common.backToQuizPlay')}
            </button>
          </div>
        )}

        {!loading && !error && subjects && subjects.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--fg-3)' }}>
            <Icon name="database" size={36} style={{ marginBottom: 16, opacity: 0.35 } as React.CSSProperties} />
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 6 }}>
              Question DB is empty
            </p>
            <p style={{ fontSize: 13, maxWidth: 340, margin: '0 auto' }}>
              No questions have been added to the database yet. Ask your teacher or admin to upload questions first.
            </p>
          </div>
        )}

        {!loading && !error && subjects && subjects.length > 0 && (
          <div className="cat-grid" data-card-style={tweaks.catCardStyle}>
            {subjects.map((s, i) => (
              <button key={s.id} className="cat-card" onClick={() => navigate(`play/${cat.id}/${s.id}/level`)}>
                {tweaks.catCardStyle === 'numbered' && (
                  <span className="cat-num">{String(i + 1).padStart(2, '0')} —</span>
                )}
                <div className="cat-ico"><Icon name="bookOpen" size={20} /></div>
                <h3>{s.name}</h3>
                <div className="cat-meta">
                  <span>{s.questionCount} {t('cat.questions')}</span>
                  <span className="dot" />
                  <span>{t('cat.levels')}</span>
                </div>
                <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
