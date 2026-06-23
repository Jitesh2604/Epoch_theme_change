import React, { useEffect, useState } from 'react';
import type { NavigateFn, QuizResult } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { ConfettiBurst } from '../../components/ui/Confetti';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { QUIZ_CATEGORIES, LEVELS } from '../../lib/data';
import { useT } from '../../lib/i18n';

interface ResultPageProps {
  navigate: NavigateFn;
  result: QuizResult | null;
  catId: string;
  subId: string;
}

export const ResultPage: React.FC<ResultPageProps> = ({ navigate, result, catId, subId }) => {
  const t = useT();
  const cat = QUIZ_CATEGORIES.find(c => c.id === catId);
  const lvl = LEVELS.find(l => l.id === result?.level);

  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!result) return;
    if (result.percent === 100) {
      setShowConfetti(true);
      showToast(`${t('result.perfect')} — ${result.correctAnswers} of ${result.answers.length}.`, 'success', 3500);
    } else if (result.percent >= 75) {
      showToast(`${t('result.strongRun')} — ${result.correctAnswers} of ${result.answers.length} correct.`, 'success', 3500);
    } else {
      showToast(t('result.quizComplete'), 'danger', 3500);
    }
  }, []);

  if (!result) {
    return (
      <div className="container" style={{ padding: 80 }}>
        <h2>{t('result.noResult')}</h2>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('play')}>
          {t('common.backToQuizPlay')}
        </button>
      </div>
    );
  }

  const pct   = Math.round(result.percent);
  const grade = pct >= 90 ? t('result.outstanding') : pct >= 75 ? t('result.strong') : pct >= 50 ? t('result.solid') : t('result.keepGoing');
  const r     = 75;
  const c     = 2 * Math.PI * r;
  const total = result.answers.length;

  return (
    <div className="page-enter">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      <PageHead
        eyebrow={
          <>
            {cat?.title}
            <span style={{ color: 'var(--fg-3)' }}> / </span>
            {result.subjectName}
            <span style={{ color: 'var(--fg-3)' }}> / </span>
            {lvl ? t(`level.${lvl.id}.title`) : ''}
          </>
        }
        title={grade + '.'}
        body={t('result.scorecard')}
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        <div className="result-wrap">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Score card */}
            <div className="result-card">
              <div className="eyebrow"><span className="dot" />{t('result.score')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
                <div className="score-circle">
                  <svg viewBox="0 0 180 180">
                    <circle className="sc-track" cx="90" cy="90" r={r} />
                    <circle className="sc-prog" cx="90" cy="90" r={r}
                      strokeDasharray={`${c * (pct / 100)} ${c}`} />
                  </svg>
                  <div className="sc-num">
                    <strong>{pct}%</strong>
                    <span>{result.correctAnswers} {t('result.of')} {total}</span>
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="result-stats">
                    <div className="r-stat good"><div className="v">{result.correctAnswers}</div><div className="l">{t('result.correct')}</div></div>
                    <div className="r-stat bad"><div className="v">{result.wrongAnswers}</div><div className="l">{t('result.wrong')}</div></div>
                    <div className="r-stat"><div className="v">{result.skipped}</div><div className="l">{t('result.skipped')}</div></div>
                  </div>
                  <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', border: '1px solid var(--border-1)', borderRadius: 12, fontSize: 13, color: 'var(--fg-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>Score</span>
                      <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {result.score} / {result.totalMarks} {t('result.pts')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Subject</span>
                      <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>{result.subjectName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => navigate(`play/${catId}/${subId}/quiz/${result.level}`)}>
                  <Icon name="refresh" size={14} /> {t('result.tryAgain')}
                </button>
                <button className="btn btn-ghost" onClick={() => navigate(`play/${catId}/${subId}/level`)}>
                  {t('result.changeDifficulty')}
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('play')}>
                  {t('result.pickAnother')}
                </button>
                <button className="btn btn-ghost" onClick={() => showToast(t('result.shareable'))}>
                  <Icon name="share" size={14} /> {t('result.share')}
                </button>
              </div>
            </div>

            {/* Question-by-question review */}
            <div style={{ padding: 28, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-xl)' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}><span className="dot" />{t('result.review')}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 18 }}>
                {t('result.questionByQuestion')}
              </h3>
              <div className="review-list">
                {result.answers.map((a, i) => {
                  const kind = a.yourAnswer.isSkipped ? 'skipped' : (a.isCorrect ? 'correct' : 'wrong');
                  const yourOptionText = a.yourAnswer.selectedOption
                    ? (a.question.options.find(o => o.letter === a.yourAnswer.selectedOption)?.text ?? a.yourAnswer.selectedOption)
                    : null;
                  const correctOptionText = a.correct.correctAnswer
                    ? (a.question.options.find(o => o.letter === a.correct.correctAnswer)?.text ?? a.correct.correctAnswer)
                    : null;
                  return (
                    <div key={i} className={`review-row ${kind}`}>
                      <span className="r-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="r-q">
                        {a.question.prompt}
                        {yourOptionText && (
                          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--fg-3)' }}>
                            {t('result.yourAnswer')}{' '}
                            <span style={{ color: a.isCorrect ? 'var(--brand)' : 'var(--danger)' }}>{yourOptionText}</span>
                            {!a.isCorrect && correctOptionText && (
                              <> · {t('result.correctAnswer')}{' '}
                                <span style={{ color: 'var(--brand)' }}>{correctOptionText}</span>
                              </>
                            )}
                          </span>
                        )}
                        {a.question.explanation && (
                          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--fg-3)', fontStyle: 'italic' }}>
                            {a.question.explanation}
                          </span>
                        )}
                      </span>
                      <span className="r-mark">
                        <Icon
                          name={kind === 'correct' ? 'check' : kind === 'wrong' ? 'x' : 'arrowRight'}
                          size={12}
                          strokeWidth={3}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer navigate={navigate} />
    </div>
  );
};
