import { useRef, useState } from 'react';
import { Eye, Printer, Download, ShieldCheck } from 'lucide-react';
import { Card, Button, Badge } from '../../../shared/ui';
import type { Certificate } from '../../../../hooks/useCertificates';
import { CertificatePreview } from './CertificatePreview';
import { downloadCertificatePdf } from './certificatePdf';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CertificateCard({
  certificate: c, onView, onVerify,
}: {
  certificate: Certificate;
  onView: (c: Certificate) => void;
  onVerify: (certificateId: string) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    onView(c); // print always goes through the full-size viewer, for a consistent print layout
    setTimeout(() => window.print(), 150);
  };

  const handleDownload = async () => {
    if (!previewRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadCertificatePdf(previewRef.current, c.certificateId);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="p-4 flex flex-col">
      <button onClick={() => onView(c)} className="block mb-3 text-left">
        <CertificatePreview ref={previewRef} certificate={c} compact />
      </button>

      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold text-[14px] text-fg1 leading-snug">{c.title}</h3>
        {c.devFallback && <Badge tone="warning" className="shrink-0">Dev</Badge>}
      </div>
      <div className="text-[11.5px] text-fg3 mb-2 truncate">{c.sessionTitle}</div>

      <div className="space-y-1 text-[12px] text-fg2 mb-3">
        <div>{c.scope === 'global' ? 'Global' : c.scope === 'state' ? 'State' : 'School'} Rank: <span className="font-semibold text-fg1">#{c.rank}</span></div>
        <div>Score: <span className="font-semibold text-fg1">{c.score}/{c.totalMarks}</span></div>
        <div className="text-fg3">Issued on {fmtDate(c.issuedAt)}</div>
        <div className="text-fg3 font-mono text-[11px]">{c.certificateId}</div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" icon={Eye} onClick={() => onView(c)}>View</Button>
        <Button size="sm" variant="outline" icon={Printer} onClick={handlePrint}>Print</Button>
        <Button size="sm" variant="outline" icon={Download} onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download PDF'}
        </Button>
        <Button size="sm" variant="outline" icon={ShieldCheck} onClick={() => onVerify(c.certificateId)}>Verify</Button>
      </div>
    </Card>
  );
}
