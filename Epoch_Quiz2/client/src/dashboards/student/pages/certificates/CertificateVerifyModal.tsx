import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Search } from 'lucide-react';
import { Modal, Button, Skeleton } from '../../../shared/ui';
import { verifyCertificate, type VerifyResult } from '../../../../hooks/useCertificates';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 font-mono focus:outline-none focus:border-brand/40';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CertificateVerifyModal({
  certificateId, onClose,
}: {
  certificateId: string | null;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');

  const runVerify = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await verifyCertificate(id.trim());
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Could not verify this certificate right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (certificateId) {
      setInput(certificateId);
      runVerify(certificateId);
    } else {
      setInput('');
      setResult(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateId]);

  return (
    <Modal open={!!certificateId} onClose={onClose} title="Verify Certificate" size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Certificate ID</label>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="EO-2026-GLO-000001"
              className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter') runVerify(input); }}
            />
            <Button size="sm" variant="outline" icon={Search} onClick={() => runVerify(input)} disabled={loading}>
              Check
            </Button>
          </div>
        </div>

        {loading && <Skeleton className="h-32 rounded-xl" />}

        {!loading && error && (
          <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">{error}</div>
        )}

        {!loading && !error && result && !result.valid && (
          <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-rose-500/10 border border-rose-500/25">
            <XCircle size={22} className="text-rose-500 shrink-0" />
            <div>
              <div className="font-semibold text-[13.5px] text-fg1">Certificate not found</div>
              <div className="text-[12px] text-fg3">This ID doesn't match a currently valid, issued certificate.</div>
            </div>
          </div>
        )}

        {!loading && !error && result?.valid && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-3 text-emerald-600 dark:text-emerald-400 font-semibold text-[14px]">
              <CheckCircle2 size={18} />
              Certificate is authentic
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div><span className="text-fg3">Student:</span> <span className="font-semibold text-fg1">{result.studentName}</span></div>
              <div><span className="text-fg3">Achievement:</span> <span className="font-semibold text-fg1">{result.title}</span></div>
              <div><span className="text-fg3">Rank:</span> <span className="font-semibold text-fg1">#{result.rank}</span></div>
              <div><span className="text-fg3">Score:</span> <span className="font-semibold text-fg1">{result.score}/{result.totalMarks}</span></div>
              <div><span className="text-fg3">Issued:</span> <span className="font-semibold text-fg1">{result.issuedAt ? fmtDate(result.issuedAt) : '—'}</span></div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
