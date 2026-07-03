import React from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { QUIZ_CATEGORIES } from '../../lib/data';
import { usePracticeSubjects } from '../../hooks/usePracticeQuiz';
import { CategoryGridSkeleton, CategoryGridError, CategoryGridEmpty } from '../../components/quiz/CategoryGridStates';
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
        {loading && <CategoryGridSkeleton cardStyle={tweaks.catCardStyle} />}

        {error && <CategoryGridError navigate={navigate} backLabel={t('common.backToQuizPlay')} />}

        {!loading && !error && subjects && subjects.length === 0 && <CategoryGridEmpty />}

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
