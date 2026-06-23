import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { useT } from '../../lib/i18n';

interface InstructionPageProps {
  navigate: NavigateFn;
}

export const InstructionPage: React.FC<InstructionPageProps> = ({ navigate }) => {
  const t = useT();
  return (
    <div className="page-enter">
      <PageHead
        eyebrow={t('nav.instructions')}
        title={t('instr.title')}
        body={t('instr.body')}
      />
      <section className="container" style={{ paddingBottom: 80, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('instr.howToPlay')}</h3>
          <div className="instr-list">
            {(['step1','step2','step3','step4','step5'] as const).map((key, i) => (
              <div key={i} className="instr">
                <div className="i-num">{String(i + 1).padStart(2, '0')}</div>
                <div><h4>{t(`instr.${key}.t`)}</h4><p>{t(`instr.${key}.d`)}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('instr.scoringRules')}</h3>
            <div className="instr-list">
              <div className="instr"><div className="i-num"><Icon name="check" size={14} strokeWidth={3} /></div><div><h4>{t('instr.score1.t')}</h4><p>{t('instr.score1.d')}</p></div></div>
              <div className="instr"><div className="i-num"><Icon name="x" size={14} strokeWidth={3} /></div><div><h4>{t('instr.score2.t')}</h4><p>{t('instr.score2.d')}</p></div></div>
              <div className="instr"><div className="i-num"><Icon name="arrowRight" size={14} strokeWidth={3} /></div><div><h4>{t('instr.score3.t')}</h4><p>{t('instr.score3.d')}</p></div></div>
            </div>
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('instr.timerRules')}</h3>
            <div className="instr-list">
              <div className="instr"><div className="i-num"><Icon name="clock" size={14} /></div><div><h4>{t('instr.timer1.t')}</h4><p>{t('instr.timer1.d')}</p></div></div>
              <div className="instr"><div className="i-num"><Icon name="clock" size={14} /></div><div><h4>{t('instr.timer2.t')}</h4><p>{t('instr.timer2.d')}</p></div></div>
              <div className="instr"><div className="i-num"><Icon name="clock" size={14} /></div><div><h4>{t('instr.timer3.t')}</h4><p>{t('instr.timer3.d')}</p></div></div>
            </div>
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('instr.navigation')}</h3>
            <div className="instr-list">
              <div className="instr"><div className="i-num"><Icon name="arrowRight" size={14} /></div><div><h4>{t('instr.nav1.t')}</h4><p>{t('instr.nav1.d')}</p></div></div>
              <div className="instr"><div className="i-num"><Icon name="arrowLeft" size={14} /></div><div><h4>{t('instr.nav2.t')}</h4><p>{t('instr.nav2.d')}</p></div></div>
            </div>
          </div>
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
