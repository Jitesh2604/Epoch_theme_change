import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { useT } from '../../lib/i18n';

interface FaqPageProps {
  navigate: NavigateFn;
}

const SECTIONS = [
  { heading: 'faq.sectionStart',      items: ['start', 'subjectDifficulty', 'answerSubmit', 'results'] },
  { heading: 'faq.sectionScoring',    items: ['scoreCorrect', 'scoreWrong', 'scoreSkip'] },
  { heading: 'faq.sectionTimers',     items: ['timerPractice', 'timerOlympiad', 'timerAssessment', 'timerResume'] },
  { heading: 'faq.sectionNavigation', items: ['navBack', 'navQuit'] },
] as const;

export const FaqPage: React.FC<FaqPageProps> = ({ navigate }) => {
  const t = useT();
  return (
    <div className="page-enter">
      <PageHead
        eyebrow={t('nav.faq')}
        title={t('faq.title')}
        body={t('faq.body')}
      />
      <section className="container" style={{ paddingBottom: 80, maxWidth: 780 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                {t(section.heading)}
              </h3>
              <div className="faq-list">
                {section.items.map((key) => (
                  <details key={key} className="faq-item">
                    <summary>
                      <span>{t(`faq.${key}.q`)}</span>
                      <Icon name="chevronDown" size={16} className="faq-chevron" />
                    </summary>
                    <p>{t(`faq.${key}.a`)}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => navigate('play')}>{t('common.startAQuiz')} <Icon name="arrowRight" size={14} /></button>
            <button className="btn btn-ghost" onClick={() => navigate('home')}>{t('common.backHome')}</button>
          </div>
        </div>
      </section>
      <Footer navigate={navigate} />
    </div>
  );
};
