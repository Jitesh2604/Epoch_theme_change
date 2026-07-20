import { Trophy } from 'lucide-react';
import { Button } from './ui';

/**
 * Shown instead of the assessment list/flow once `SESSION_END_DATE`
 * (config/assessmentSession.ts) has passed — students can still practice,
 * just not start or resume graded assessments until the next session.
 */
export function SessionOverScreen() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 min-h-[50vh]">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 grid place-items-center mb-5">
        <Trophy size={28} />
      </div>
      <h2 className="font-display font-semibold text-[22px] text-fg1 mb-2">
        The 2026 Assessment Session is over
      </h2>
      <p className="text-[14px] text-fg3 max-w-md mb-6">
        Please come back for the 2027 session. In the meantime, keep your skills sharp with Practice Olympiad.
      </p>
      <Button icon={Trophy} onClick={() => { window.location.href = '/#/play'; }}>
        Practice Olympiad
      </Button>
    </div>
  );
}
