import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Trophy, Clock } from 'lucide-react';
import { CertificateCard } from '../../student/pages/certificates/CertificateCard';
import { CertificateViewerModal } from '../../student/pages/certificates/CertificateViewerModal';
import { CertificateVerifyModal } from '../../student/pages/certificates/CertificateVerifyModal';
import { useSchoolStudents, type SchoolStudentRow } from '../../../hooks/useSchoolPanel';
import { api } from '../../../lib/api';
import type { Certificate } from '../../../hooks/useCertificates';
import { topPerformers } from '../schoolAggregates';
import { SchoolCard, SchoolPageHeading, SchoolSkeleton, SchoolEmptyState, SchoolAvatar, SchoolPill, SchoolSectionLabel } from '../schoolUI';

interface StudentCertificates { student: SchoolStudentRow; certificates: Certificate[] }

/**
 * No endpoint returns certificates for every student in a school at once
 * (certificates are computed live, per-student, from CertificateService —
 * see useSchoolPanel.ts's useSchoolStudentCertificates). Rather than add a
 * new backend aggregate endpoint, this reuses that exact same real
 * per-student endpoint, fanned out client-side across the roster (capped at
 * 60 students — comfortably above every school seen in this app so far —
 * to keep this a bounded number of real requests, not literally
 * unbounded). Every certificate shown is real and independently verifiable
 * via the same CertificateVerifyModal a student uses for their own.
 */
function useSchoolCertificates(students: SchoolStudentRow[]) {
  const [data, setData] = useState<StudentCertificates[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!students.length) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const scoped = students.slice(0, 60);
    Promise.all(scoped.map(async (student) => {
      try {
        const certificates = await api.get<Certificate[]>(`/school-panel/students/${student.id}/certificates`);
        return { student, certificates };
      } catch {
        return { student, certificates: [] };
      }
    })).then(results => { if (!cancelled) { setData(results); setLoading(false); } });
    return () => { cancelled = true; };
  }, [students]);

  return { data, loading };
}

export function SchoolCertificatesPage() {
  const navigate = useNavigate();
  const { data: roster, loading: rosterLoading } = useSchoolStudents({ page: 1, limit: 500 });
  const students = roster?.items ?? [];
  const { data: perStudent, loading: certsLoading } = useSchoolCertificates(students);

  const [viewingCert, setViewingCert] = useState<Certificate | null>(null);
  const [verifyingCertId, setVerifyingCertId] = useState<string | null>(null);

  const allCertificates = useMemo(() => (perStudent ?? []).flatMap(x => x.certificates.map(c => ({ ...c, studentId: x.student.id }))), [perStudent]);
  const recent = useMemo(() => [...allCertificates].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)).slice(0, 6), [allCertificates]);
  const top = useMemo(() => topPerformers(students, 5), [students]);

  const loading = rosterLoading || certsLoading;

  return (
    <div>
      <SchoolPageHeading eyebrow="🎖️ Achievement Center" title="Certificates" subtitle="Achievements earned by students across your school." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SchoolCard>
          <div className="w-10 h-10 rounded-xl bg-[var(--sp-warning-bg)] text-[var(--sp-warning)] grid place-items-center mb-3"><Award size={18} /></div>
          <div className="font-body font-extrabold text-[26px] text-[var(--sp-text)]">{loading ? '…' : allCertificates.length}</div>
          <div className="text-[12px] font-semibold text-[var(--sp-muted)] mt-0.5">Certificates Earned</div>
        </SchoolCard>
        <SchoolCard>
          <div className="w-10 h-10 rounded-xl bg-[var(--sp-navy-100)] text-[var(--sp-navy)] grid place-items-center mb-3"><Trophy size={18} /></div>
          <div className="font-body font-extrabold text-[26px] text-[var(--sp-text)]">{loading ? '…' : new Set(allCertificates.map(c => c.studentId)).size}</div>
          <div className="text-[12px] font-semibold text-[var(--sp-muted)] mt-0.5">Students with a Certificate</div>
        </SchoolCard>
        <SchoolCard>
          <div className="w-10 h-10 rounded-xl bg-[var(--sp-success-bg)] text-[var(--sp-success)] grid place-items-center mb-3"><Clock size={18} /></div>
          <div className="font-body font-extrabold text-[26px] text-[var(--sp-text)]">{loading ? '…' : recent.length}</div>
          <div className="text-[12px] font-semibold text-[var(--sp-muted)] mt-0.5">Recent (shown below)</div>
        </SchoolCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SchoolSectionLabel>Recent Certificates</SchoolSectionLabel>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <SchoolSkeleton key={i} className="h-64 rounded-2xl" />)}</div>
          ) : !recent.length ? (
            <SchoolCard><SchoolEmptyState icon={Award} title="No certificates earned yet." desc="Certificates appear automatically as students qualify — School/State/Global Champion, and Top 10/Top 100 rankings." /></SchoolCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recent.map(c => (
                <CertificateCard key={c.certificateId} certificate={c} onView={setViewingCert} onVerify={setVerifyingCertId} />
              ))}
            </div>
          )}
        </div>

        <div>
          <SchoolSectionLabel>Top Students</SchoolSectionLabel>
          {rosterLoading ? (
            <SchoolCard><SchoolSkeleton className="h-48" /></SchoolCard>
          ) : !top.length ? (
            <SchoolCard><SchoolEmptyState icon={Trophy} title="No data yet." desc="Top students appear once assessments are attempted." /></SchoolCard>
          ) : (
            <SchoolCard noPad className="divide-y divide-[var(--sp-border)] overflow-hidden">
              {top.map((s, i) => {
                const count = (perStudent ?? []).find(x => x.student.id === s.id)?.certificates.length ?? 0;
                return (
                  <button key={s.id} onClick={() => navigate(`/school/students/${s.id}?tab=certificates`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--sp-surface-alt)] transition text-left">
                    <span className="text-[11px] font-mono font-bold text-[var(--sp-muted-2)] w-4">#{i + 1}</span>
                    <SchoolAvatar name={s.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-[var(--sp-text)] truncate">{s.name}</div>
                      <div className="text-[11px] text-[var(--sp-muted)] truncate">{s.averagePercentage}% average</div>
                    </div>
                    {count > 0 && <SchoolPill tone="navy" dot={false}>{count} 🏅</SchoolPill>}
                  </button>
                );
              })}
            </SchoolCard>
          )}
        </div>
      </div>

      <CertificateViewerModal
        certificate={viewingCert}
        onClose={() => setViewingCert(null)}
        onVerify={(id) => { setViewingCert(null); setVerifyingCertId(id); }}
      />
      <CertificateVerifyModal certificateId={verifyingCertId} onClose={() => setVerifyingCertId(null)} />
    </div>
  );
}
