import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../ui/Icon';
import { useT } from '../../lib/i18n';

interface FooterProps {
  navigate: NavigateFn;
}

export const Footer: React.FC<FooterProps> = ({ navigate }) => {
  const t = useT();
  return (
  <footer className="footer">
    <div className="container">
      <div className="foot-grid">
        <div className="foot-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <img src="assets/logo-mark.svg" alt="" style={{ width: 28, height: 28 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>
                Olympaid <em style={{ color: 'var(--brand)', fontStyle: 'italic' }}>Quiz</em>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>EPOCH · AI · CO-PILOT</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-2)', maxWidth: 320 }}>
            {t('footer.description')}
          </p>
          <div className="socials" style={{ marginTop: 16 }}>
            {(['twitter','github','linkedin','mail'] as const).map(s => (
              <a key={s} href="#" className="social" onClick={(e) => e.preventDefault()}>
                <Icon name={s} size={16} />
              </a>
            ))}
          </div>
        </div>

        <div className="foot-col">
          <h5>{t('footer.product')}</h5>
          <button onClick={() => navigate('home')}>{t('footer.home')}</button>
          <button onClick={() => navigate('play')}>{t('footer.quizLibrary')}</button>
          <button onClick={() => navigate('play/daily/d-today')}>{t('footer.dailyQuiz')}</button>
          <button onClick={() => navigate('instruction')}>{t('footer.howItWorks')}</button>
        </div>
        <div className="foot-col">
          <h5>{t('footer.company')}</h5>
          <button onClick={() => navigate('about')}>{t('footer.aboutUs')}</button>
          <button onClick={() => navigate('contact')}>{t('footer.contactUs')}</button>
          <a href="#" onClick={(e) => e.preventDefault()}>{t('footer.careers')}</a>
          <a href="#" onClick={(e) => e.preventDefault()}>{t('footer.pressKit')}</a>
        </div>
        <div className="foot-col">
          <h5>{t('footer.legal')}</h5>
          <button onClick={() => navigate('privacy')}>{t('footer.privacyPolicy')}</button>
          <button onClick={() => navigate('terms')}>{t('footer.termsConditions')}</button>
          <a href="#" onClick={(e) => e.preventDefault()}>{t('footer.cookieSettings')}</a>
          <a href="#" onClick={(e) => e.preventDefault()}>{t('footer.security')}</a>
        </div>
      </div>
      <div className="foot-bottom">
        <div>{t('footer.copyright')}</div>
        <div>{t('footer.tagline')}</div>
      </div>
    </div>
  </footer>
  );
};
