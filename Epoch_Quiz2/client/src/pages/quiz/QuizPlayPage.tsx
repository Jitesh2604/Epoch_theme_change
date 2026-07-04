import React from 'react';
import type { NavigateFn, Tweaks } from '../../types';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { SubjectCategoryGrid } from '../../components/quiz/SubjectCategoryGrid';
import { useT } from '../../lib/i18n';

interface QuizPlayPageProps {
  navigate: NavigateFn;
  tweaks: Tweaks;
}

/**
 * Categories page — every card comes straight from the Subjects API via the
 * shared <SubjectCategoryGrid> (the same component the Home page uses). Normal
 * subjects start a Subject Practice quiz; the special "Practice Olympiad" /
 * "Attempted Olympiad" rows route to the Olympiad flows.
 */
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
        <SubjectCategoryGrid
          navigate={navigate}
          cardStyle={tweaks.catCardStyle}
          backLabel={t('common.backToQuizPlay')}
        />
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
