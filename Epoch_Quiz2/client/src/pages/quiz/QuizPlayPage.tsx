import React from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { QUIZ_CATEGORIES } from '../../lib/data';
import { useT } from '../../lib/i18n';

interface QuizPlayPageProps {
  navigate: NavigateFn;
  tweaks: Tweaks;
}

export const QuizPlayPage: React.FC<QuizPlayPageProps> = ({ navigate, tweaks }) => {
  const t = useT();

  return (
    <div className="page-enter">
      <PageHead
        eyebrow={t('nav.quizPlay')}
        title={t('page.chooseCategory')}
        body={t('page.twoQuizModes')}
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        <div className="cat-grid" data-card-style={tweaks.catCardStyle}>
          {QUIZ_CATEGORIES.map((c, i) => (
            <button key={c.id} className="cat-card" onClick={() => navigate(`play/${c.id}`)}>
              {tweaks.catCardStyle === 'numbered' && (
                <span className="cat-num">{String(i + 1).padStart(2, '0')} —</span>
              )}
              <div className="cat-ico"><Icon name={c.icon} size={20} /></div>
              <h3>{c.title}</h3>
              <p>{c.blurb}</p>
              <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
            </button>
          ))}
        </div>
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
