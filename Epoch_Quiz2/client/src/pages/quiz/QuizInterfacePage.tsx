import React, { useState, useEffect, useRef } from 'react';
import type { NavigateFn, Tweaks, QuizResult } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { QUIZ_CATEGORIES, LEVELS } from '../../lib/data';
import { practiceApi, type PracticeAttemptData, type SaveAnswerFeedback } from '../../hooks/usePracticeQuiz';
import { useT } from '../../lib/i18n';

let _audioCtx: AudioContext | null = null;

const beep = (freq = 880, dur = 80, vol = 0.06) => {
  try {
    if (!_audioCtx) {
      const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) _audioCtx = new AudioCtx();
    }
    if (!_audioCtx) return;
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(_audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, _audioCtx.currentTime + dur / 1000);
    o.stop(_audioCtx.currentTime + dur / 1000 + 0.02);
  } catch (_) {}
};

interface QuizInterfacePageProps {
  navigate: NavigateFn;
  catId: string;
  subId: string;
  level: string;
  tweaks: Tweaks;
  sfx: boolean;
  setQuizResult: (r: QuizResult) => void;
}

export const QuizInterfacePage: React.FC<QuizInterfacePageProps> = ({
  navigate, catId, subId, level, tweaks, sfx, setQuizResult,
}) => {
  const t = useT();
  // catId is the subject slug from the dynamic Categories page; fall back so any
  // subject works, not only the static ones.
  const cat = QUIZ_CATEGORIES.find(c => c.id === catId) ?? { id: catId, title: t('nav.quizPlay'), blurb: '' };
  const lvl = LEVELS.find(l => l.id === level);

  const [session, setSession]           = useState<PracticeAttemptData | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [idx, setIdx]           = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked]     = useState(false);
  const [feedback, setFeedback] = useState<SaveAnswerFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startMs = useRef(Date.now());

  useEffect(() => {
    if (!lvl) return;
    const difficulty = level.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD';
    practiceApi
      .start({ subjectId: subId, difficulty, questionCount: lvl.questions })
      .then(data => {
        if (!data.questions || data.questions.length === 0) {
          setSessionError('__empty__');
        } else {
          setSession(data);
          startMs.current = Date.now();
        }
        setSessionLoading(false);
      })
      .catch((e: any) => {
        const msg: string = e?.message ?? '';
        const isEmptyDb = msg.toLowerCase().includes('no question') || msg.toLowerCase().includes('not available');
        setSessionError(isEmptyDb ? '__empty__' : msg || 'Could not start quiz. Please try again.');
        setSessionLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cat || !lvl) {
    return (
      <div className="container" style={{ padding: 80 }}>
        <h2>{t('quiz.notConfigured')}</h2>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('play')}>
          {t('common.backToQuizPlay')}
        </button>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center', color: 'var(--fg-3)' }}>
        <div style={{ fontSize: 14 }}>Loading questions…</div>
      </div>
    );
  }

  if (sessionError === '__empty__') {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center' }}>
        <Icon name="database" size={36} style={{ opacity: 0.35, marginBottom: 16 } as React.CSSProperties} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Question DB is empty</h2>
        <p style={{ color: 'var(--fg-3)', fontSize: 14, marginBottom: 20, maxWidth: 340, margin: '0 auto 20px' }}>
          No questions are available for this subject and difficulty. Ask your teacher or admin to add questions first.
        </p>
        <button className="btn btn-ghost" onClick={() => navigate(`play/${catId}/${subId}/level`)}>
          {t('common.backToQuizPlay')}
        </button>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center' }}>
        <Icon name="info" size={28} style={{ color: 'var(--danger)', marginBottom: 12 } as React.CSSProperties} />
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Could not load quiz</h2>
        <p style={{ color: 'var(--fg-3)', fontSize: 14, marginBottom: 20 }}>{sessionError}</p>
        <button className="btn btn-ghost" onClick={() => navigate(`play/${catId}/${subId}/level`)}>
          {t('common.backToQuizPlay')}
        </button>
      </div>
    );
  }

  const questions = session.questions;
  const cur = questions[idx];

  const getOptions = (): { letter: string; text: string }[] => {
    if (cur.options && cur.options.length > 0) return cur.options;
    if (cur.type === 'TRUE_FALSE') return [{ letter: 'A', text: 'True' }, { letter: 'B', text: 'False' }];
    return [];
  };
  const options = getOptions();

  const handleSubmit = async (skip = false) => {
    if (locked || submitting) return;
    setSubmitting(true);
    try {
      const answerData = skip
        ? { questionId: cur.id, isSkipped: true }
        : { questionId: cur.id, selectedOption: selected ?? undefined, isSkipped: !selected };
      const fb = await practiceApi.saveAnswer(session.attemptId, answerData);
      setFeedback(fb);
      setLocked(true);
      if (sfx) beep(fb.isCorrect ? 880 : 220, 120, 0.08);
    } catch (e: any) {
      showToast(e?.message ?? 'Could not save answer', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const next = async () => {
    if (idx + 1 < questions.length) {
      setIdx(i => i + 1);
      setSelected(null);
      setLocked(false);
      setFeedback(null);
    } else {
      setSubmitting(true);
      try {
        const timeTakenSec = Math.floor((Date.now() - startMs.current) / 1000);
        const result = await practiceApi.submit(session.attemptId, timeTakenSec);
        const quizResult: QuizResult = {
          catId,
          subId,
          subjectName: session.subject.name,
          level,
          attemptId: result.attemptId,
          score: result.score,
          totalMarks: result.totalMarks,
          percent: result.percent,
          correctAnswers: result.correctAnswers,
          wrongAnswers: result.wrongAnswers,
          skipped: result.skipped,
          answers: result.answers,
        };
        setQuizResult(quizResult);
        navigate(`play/${catId}/${subId}/result`);
      } catch (e: any) {
        showToast(e?.message ?? 'Could not submit quiz', 'danger');
        setSubmitting(false);
      }
    }
  };

  const correctLetter = feedback?.feedback?.correctAnswer ?? null;
  const statusText = locked
    ? (feedback?.isCorrect ? t('quiz.correct') : (!selected ? t('quiz.skipped') : t('quiz.wrong')))
    : t('quiz.selectAnswer');

  return (
    <div className="page-enter">
      <div className="quiz-head">
        <div className="container">
          <div className="quiz-head-row">
            <button
              className="btn btn-ghost sm"
              onClick={() => {
                if (confirm(t('quiz.leaveConfirm'))) navigate(`play/${catId}/${subId}/level`);
              }}
            >
              <Icon name="arrowLeft" size={14} /> {t('quiz.quit')}
            </button>
            <span className={`q-pill ${lvl.id}`}>
              <span className="dot" /> {t(`level.${lvl.id}.title`)}
            </span>
            <span className="q-counter">
              {t('quiz.question')} <strong>{idx + 1}</strong> / {questions.length}
            </span>
            <div className="q-bar-wrap" style={{ minWidth: 120 }}>
              <div className="q-bar" style={{ width: `${((idx + (locked ? 1 : 0)) / questions.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="quiz-body container">
        <div className="quiz-grid" data-layout={tweaks.quizLayout} key={idx}>
          <div className="q-box">
            <div className="q-tag">
              <span>{cat.title} · {session.subject.name}</span>
              <span className="q-num">{String(idx + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}</span>
            </div>
            <div className="q-text">{cur.prompt}</div>
            {locked && feedback?.feedback?.explanation && (
              <div className="q-hint" style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 10, borderLeft: '2px solid var(--brand)' }}>
                <strong style={{ color: 'var(--brand)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  {t('quiz.explanation')}
                </strong>
                <span style={{ color: 'var(--fg-1)', fontSize: 14, lineHeight: 1.55 }}>{feedback.feedback.explanation}</span>
              </div>
            )}
          </div>

          <div className="q-options" data-opt-style={tweaks.optionStyle}>
            {options.map(opt => {
              const isCorrect  = locked && opt.letter === correctLetter;
              const isSelected = opt.letter === selected;
              let cls = 'q-option';
              if (locked) {
                if (isCorrect) cls += ' correct';
                else if (isSelected) cls += ' wrong';
              } else if (isSelected) {
                cls += ' selected';
              }
              return (
                <button key={opt.letter} className={cls} disabled={locked || submitting} onClick={() => setSelected(opt.letter)}>
                  <span className="o-key">{opt.letter}</span>
                  <span className="o-text">{opt.text}</span>
                  {locked && (isCorrect || isSelected) && (
                    <span className="o-mark">
                      <Icon name={isCorrect ? 'check' : 'x'} size={16} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="quiz-actions">
          <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {statusText}
          </span>
          <div className="spacer" />
          {!locked && (
            <button className="btn btn-ghost" disabled={submitting} onClick={() => handleSubmit(true)}>
              {t('quiz.skip')}
            </button>
          )}
          {!locked && (
            <button className="btn btn-primary" disabled={selected == null || submitting} onClick={() => handleSubmit(false)}>
              {submitting ? 'Saving…' : t('quiz.submit')}
            </button>
          )}
          {locked && (
            <button className="btn btn-primary" disabled={submitting} onClick={next}>
              {submitting
                ? 'Submitting…'
                : idx + 1 < questions.length
                  ? <>{t('quiz.nextQuestion')} <Icon name="arrowRight" size={14} /></>
                  : <>{t('quiz.finishQuiz')} <Icon name="check" size={14} strokeWidth={2.5} /></>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
