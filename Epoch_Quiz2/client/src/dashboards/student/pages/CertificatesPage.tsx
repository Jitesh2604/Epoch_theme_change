import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Trophy, FlaskConical } from 'lucide-react';
import { PageHeader, Card, Button, Skeleton, EmptyState } from '../../shared/ui';
import { useMyCertificates, type Certificate } from '../../../hooks/useCertificates';
import { CertificateCard } from './certificates/CertificateCard';
import { CertificateViewerModal } from './certificates/CertificateViewerModal';
import { CertificateVerifyModal } from './certificates/CertificateVerifyModal';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

export function CertificatesPage() {
  const navigate = useNavigate();
  const { data: certificates, loading } = useMyCertificates();
  const [viewing, setViewing] = useState<Certificate | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const isDevPreview = !!certificates?.some(c => c.devFallback);

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Certificates"
        title="My Certificates"
        subtitle="Your achievements and milestones on Epoch Olympiad."
        actions={
          <Button variant="outline" icon={Trophy} onClick={() => navigate('/leaderboard')}>
            View Leaderboard
          </Button>
        }
      />

      {isDevPreview && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[12.5px] font-medium">
          <FlaskConical size={14} className="shrink-0" />
          Dev preview data — no real published Assessment results yet. These certificates will disappear automatically once real results exist.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
        </div>
      ) : !certificates?.length ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No certificates earned yet"
            desc="Keep participating in assessments and achieve top ranks to earn certificates."
            action={
              <Button variant="outline" icon={Trophy} onClick={() => navigate('/leaderboard')}>
                View Leaderboard
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {certificates.map(c => (
            <CertificateCard
              key={c.certificateId}
              certificate={c}
              onView={setViewing}
              onVerify={setVerifyingId}
            />
          ))}
        </div>
      )}

      <CertificateViewerModal
        certificate={viewing}
        onClose={() => setViewing(null)}
        onVerify={(id) => { setViewing(null); setVerifyingId(id); }}
      />
      <CertificateVerifyModal certificateId={verifyingId} onClose={() => setVerifyingId(null)} />
    </StandalonePage>
  );
}
