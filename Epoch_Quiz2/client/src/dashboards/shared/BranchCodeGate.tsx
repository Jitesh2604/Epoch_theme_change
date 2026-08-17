import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Modal } from './ui';
import { branchCodeApi } from '../../hooks/useBranchCodes';
import { ApiError } from '../../lib/api';

/**
 * Shown instead of the assessment list/overview when the student hasn't
 * verified their Branch Code yet (see useAssessmentAccess /
 * requireBranchVerification on the backend — this is a UX convenience, not
 * the security boundary itself). Verifying does NOT let the student pick a
 * school/branch — it only confirms the code matches the School+Branch they
 * already selected at registration.
 */
export function BranchCodeGate({ onVerified }: { onVerified: () => void }) {
  const [open, setOpen]             = useState(true);
  const [code, setCode]             = useState('');
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!code.trim()) { setError('Enter your Branch Code.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await branchCodeApi.verify(code.trim());
      setOpen(false);
      onVerified();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify that code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center text-center py-20 px-6 min-h-[50vh]">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 grid place-items-center mb-5">
          <KeyRound size={28} />
        </div>
        <h2 className="font-display font-semibold text-[22px] text-fg1 mb-2">
          Branch Code Required
        </h2>
        <p className="text-[14px] text-fg3 max-w-md mb-6">
          Ask your school for your Branch Code to unlock Assessment. Practice stays open either way.
        </p>
        <Button icon={KeyRound} onClick={() => setOpen(true)}>
          Enter Branch Code
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => { if (!submitting) setOpen(false); }}
        title="Enter your Branch Code"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Verifying…' : 'Verify'}</Button>
          </>
        }
      >
        <p className="text-[13px] text-fg3 mb-4">
          A Branch Code is required to access Assessment. Enter the code your school shared with you —
          it must match the school and branch you selected on your profile.
        </p>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="e.g. DPS-RH-4829"
          autoFocus
          className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
        />
        {error && <p className="text-[12.5px] text-danger mt-2">{error}</p>}
      </Modal>
    </>
  );
}
