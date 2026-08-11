import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Captures the given CertificatePreview DOM node (the exact same component
 * used on-screen and in the viewer modal — see CertificatePreview.tsx) and
 * embeds it as an image in a landscape A4 PDF. WYSIWYG by construction: the
 * PDF always shows exactly what the viewer shows, since it's the same node.
 */
export async function downloadCertificatePdf(node: HTMLElement, certificateId: string): Promise<void> {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit the captured certificate inside the page with a small margin,
  // preserving its aspect ratio rather than stretching it.
  const margin = 12;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageWidth - w) / 2;
  const y = (pageHeight - h) / 2;

  pdf.addImage(imgData, 'PNG', x, y, w, h);
  pdf.save(`${certificateId}.pdf`);
}
