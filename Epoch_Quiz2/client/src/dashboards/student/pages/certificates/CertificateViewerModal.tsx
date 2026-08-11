import { useRef, useState } from 'react';
import { Printer, Download, ShieldCheck } from 'lucide-react';
import { Modal, Button } from '../../../shared/ui';
import type { Certificate } from '../../../../hooks/useCertificates';
import { CertificatePreview } from './CertificatePreview';
import { downloadCertificatePdf } from './certificatePdf';

export function CertificateViewerModal({
  certificate, onClose, onVerify,
}: {
  certificate: Certificate | null;
  onClose: () => void;
  onVerify: (certificateId: string) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!previewRef.current || !certificate || downloading) return;
    setDownloading(true);
    try {
      await downloadCertificatePdf(previewRef.current, certificate.certificateId);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={!!certificate}
      onClose={onClose}
      title={certificate?.title ?? 'Certificate'}
      size="xl"
      footer={
        certificate && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="outline" icon={ShieldCheck} onClick={() => onVerify(certificate.certificateId)}>Verify</Button>
            <Button variant="outline" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button icon={Download} onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download PDF'}
            </Button>
          </>
        )
      }
    >
      {certificate && <CertificatePreview ref={previewRef} certificate={certificate} printTarget />}
    </Modal>
  );
}
