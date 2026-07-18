import { useState, useRef, DragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Download, FileCheck2, AlertTriangle, ArrowRight, History } from 'lucide-react';
import { PageHeader, Card, Button, Badge, useToasts } from './ui';
import { getAccessToken } from '../../lib/api';
import { refreshSession } from '../../lib/authStore';

type Phase = 'idle' | 'previewing' | 'uploading' | 'done' | 'error';

interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdQuestions: number;
  attachedToAssessment: number;
  errors: { row: number; field?: string; message: string }[];
}

export function UploadQuestionsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const roleLabel = location.pathname.startsWith('/teacher') ? 'Teacher' : 'Admin';
  const historyPath = location.pathname.startsWith('/teacher') ? '/teacher/upload-questions/history' : '/admin/upload-questions/history';
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { push, node } = useToasts();

  const handleFile = (file: File) => {
    const ok = /\.(xlsx?|csv)$/i.test(file.name);
    if (!ok) {
      push({ kind: 'danger', title: 'Unsupported file', sub: 'Please upload an .xlsx, .xls, or .csv file.' });
      setPhase('error');
      return;
    }
    setFileName(file.name);
    setSelectedFile(file);
    setPhase('previewing');
    push({ kind: 'info', title: 'File ready', sub: 'Click "Import questions" to upload.' });
  };

  // Raw fetch calls bypass api.ts's auto-retry logic, so we handle token expiry
  // manually: try once, and if we get 401 (token expired), refresh then retry.
  const authHeader = async (): Promise<Record<string, string>> => {
    let token = getAccessToken();
    if (!token) {
      await refreshSession();
      token = getAccessToken();
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const retryOn401 = async (doFetch: () => Promise<Response>): Promise<Response> => {
    const res = await doFetch();
    if (res.status === 401) {
      await refreshSession();
      return doFetch();
    }
    return res;
  };

  const downloadTemplate = async () => {
    try {
      const headers = await authHeader();
      const res = await retryOn401(() =>
        fetch('/api/v1/questions/upload/template', { headers })
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        push({ kind: 'danger', title: 'Download failed', sub: err?.error?.message ?? `Error ${res.status}` });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'epoch-quiz-questions-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      push({ kind: 'danger', title: 'Download failed' });
    }
  };

  const startImport = async () => {
    if (!selectedFile) return;
    setPhase('uploading');
    setProgress(20);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const headers = await authHeader();

      setProgress(50);
      const response = await retryOn401(() =>
        fetch('/api/v1/questions/upload?dryRun=false&stopOnError=false', {
          method: 'POST',
          headers,
          body: formData,
        })
      );
      setProgress(90);
      const result = await response.json();
      setProgress(100);
      if (!response.ok) {
        setPhase('error');
        push({ kind: 'danger', title: 'Import failed', sub: result?.error?.message ?? `Error ${response.status}` });
        return;
      }
      setPhase('done');
      push({
        kind: 'success',
        title: 'Import complete',
        sub: `${result.data?.createdQuestions ?? 0} questions added to your bank.`,
      });
    } catch (e: any) {
      setPhase('error');
      push({ kind: 'danger', title: 'Import failed', sub: e.message });
    }
  };

  const reset = () => { setPhase('idle'); setFileName(null); setProgress(0); };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow={`${roleLabel} · Bulk Import`}
        title="Upload Questions"
        subtitle="Drag and drop an Excel sheet to add many questions at once. We'll preview them before anything is saved."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" icon={History} onClick={() => navigate(historyPath)}>Upload history</Button>
            <Button variant="outline" icon={Download} onClick={downloadTemplate}>Download template</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-5">
          <Card className="p-6">
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all p-10 text-center ${
                isDragging
                  ? 'border-brand bg-brand-soft scale-[1.01]'
                  : phase === 'done' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line2 hover:border-brand hover:bg-surface1/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-brand-soft text-brand grid place-items-center mx-auto mb-4">
                      <Upload size={28} />
                    </div>
                    <h3 className="font-display font-semibold text-[18px] text-fg1 mb-1">Drop your Excel file here</h3>
                    <p className="text-[13px] text-fg3 mb-4">or click anywhere to browse · .xlsx, .xls, .csv up to 10MB</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-brand-ink text-[13px] font-semibold">
                      <FileSpreadsheet size={14} />Choose file
                    </div>
                  </motion.div>
                )}
                {phase === 'previewing' && (
                  <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-300 grid place-items-center mx-auto mb-4">
                      <FileCheck2 size={28} />
                    </div>
                    <h3 className="font-display font-semibold text-[18px] text-fg1 mb-1">{fileName}</h3>
                    <p className="text-[13px] text-fg3">{SAMPLE_PREVIEW.length} questions detected · review and import below</p>
                  </motion.div>
                )}
                {phase === 'uploading' && (
                  <motion.div key="uploading" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-brand-soft text-brand grid place-items-center mx-auto mb-4 animate-pulse-soft">
                      <Upload size={28} />
                    </div>
                    <h3 className="font-display font-semibold text-[16px] text-fg1 mb-2">Importing questions…</h3>
                    <div className="max-w-md mx-auto">
                      <div className="h-2 rounded-full bg-line overflow-hidden">
                        <motion.div className="h-full bg-brand" animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} />
                      </div>
                      <div className="text-[12px] text-fg3 mt-2">{progress}% complete</div>
                    </div>
                  </motion.div>
                )}
                {phase === 'done' && (
                  <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 grid place-items-center mx-auto mb-4">
                      <CheckCircle2 size={28} />
                    </div>
                    <h3 className="font-display font-semibold text-[18px] text-fg1 mb-1">Import successful</h3>
                    <p className="text-[13px] text-fg3">{SAMPLE_PREVIEW.length} questions added to your question bank.</p>
                  </motion.div>
                )}
                {phase === 'error' && (
                  <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/15 text-rose-300 grid place-items-center mx-auto mb-4">
                      <XCircle size={28} />
                    </div>
                    <h3 className="font-display font-semibold text-[18px] text-fg1 mb-1">Unsupported file type</h3>
                    <p className="text-[13px] text-fg3">Please use .xlsx, .xls or .csv format.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {(phase === 'previewing' || phase === 'done' || phase === 'error') && (
              <div className="flex justify-end gap-2 mt-5">
                <Button variant="ghost" onClick={reset}>Choose another file</Button>
                {phase === 'previewing' && <Button icon={ArrowRight} onClick={startImport}>Import {SAMPLE_PREVIEW.length} questions</Button>}
              </div>
            )}
          </Card>

          {(phase === 'previewing' || phase === 'done') && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                <div>
                  <h3 className="font-display font-semibold text-[15px] text-fg1">File preview</h3>
                  <p className="text-[11.5px] text-fg3 mt-0.5">Showing first {SAMPLE_PREVIEW.length} rows from {fileName}</p>
                </div>
                <Badge tone="success">Valid format</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-fg3 text-[10.5px] font-semibold uppercase tracking-wider bg-surface1/50">
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-4 py-2.5">type</th>
                      <th className="px-4 py-2.5">prompt</th>
                      <th className="px-4 py-2.5">correctOption / correctBoolean</th>
                      <th className="px-4 py-2.5">subject</th>
                      <th className="px-4 py-2.5">marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_PREVIEW.map((r, i) => (
                      <tr key={i} className="border-t border-line/70 hover:bg-surface1/50">
                        <td className="px-4 py-2.5 font-mono text-fg3">{i + 1}</td>
                        <td className="px-4 py-2.5"><Badge tone={r.type === 'MCQ' ? 'brand' : r.type === 'TrueFalse' ? 'info' : 'warning'} dot={false}>{r.type}</Badge></td>
                        <td className="px-4 py-2.5 text-fg1 max-w-md truncate">{r.question}</td>
                        <td className="px-4 py-2.5 font-mono text-fg2">{r.correct}</td>
                        <td className="px-4 py-2.5 text-fg2">{r.subject}</td>
                        <td className="px-4 py-2.5 font-mono text-fg2">{r.marks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h4 className="font-display font-semibold text-[15px] text-fg1 mb-2">Required columns</h4>
            <p className="text-[12px] text-fg3 mb-4">Your Excel file must include the following columns (in any order).</p>
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="bg-surface1/50 text-fg3 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">Required</th>
                    <th className="px-3 py-2">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {[
                    { col: 'type',          req: true,  ex: 'MCQ_SINGLE / TRUE_FALSE / DESCRIPTIVE' },
                    { col: 'prompt',        req: true,  ex: 'What is 2 + 2?' },
                    { col: 'option1',       req: false, ex: '3  (MCQ only, min 2)' },
                    { col: 'option2',       req: false, ex: '4' },
                    { col: 'option3',       req: false, ex: '5' },
                    { col: 'option4',       req: false, ex: '6' },
                    { col: 'correctOption', req: false, ex: 'B  (MCQ: letter A–D or 1–4)' },
                    { col: 'correctBoolean',req: false, ex: 'TRUE / FALSE  (TRUE_FALSE only)' },
                    { col: 'modelAnswer',   req: false, ex: 'Sample answer (DESCRIPTIVE only)' },
                    { col: 'explanation',   req: false, ex: 'Shown after grading (any type)' },
                    { col: 'marks',         req: false, ex: '1  (default 1, max 100)' },
                    { col: 'difficulty',    req: false, ex: 'EASY / MEDIUM / HARD' },
                    { col: 'tags',          req: false, ex: 'algebra, arithmetic' },
                    { col: 'subject',       req: false, ex: 'Mathematics (must exist in system)' },
                    { col: 'promptImageUrl',      req: false, ex: 'URL to an already-hosted image' },
                    { col: 'option1ImageUrl…4',   req: false, ex: 'URL per MCQ option' },
                    { col: 'explanationImageUrl', req: false, ex: 'URL to an already-hosted image' },
                  ].map(r => (
                    <tr key={r.col}>
                      <td className="px-3 py-2 font-mono text-fg1">{r.col}</td>
                      <td className="px-3 py-2">{r.req ? <Badge tone="brand" dot={false}>Yes</Badge> : <span className="text-fg3">No</span>}</td>
                      <td className="px-3 py-2 text-fg2">{r.ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" icon={Download} className="w-full mt-4" onClick={downloadTemplate}>Download Excel template</Button>
          </Card>

          <Card className="p-5 border border-amber-500/20 bg-amber-500/5">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-fg2 leading-relaxed">
                <strong className="text-fg1 block mb-1">Heads up</strong>
                Question text must be unique. Duplicates already in your bank will be skipped during import.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
