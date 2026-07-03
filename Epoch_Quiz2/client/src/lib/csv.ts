/** Trigger a client-side CSV download from data rows + a header row. */
export function exportCsv(
  filename: string,
  rows: (string | number | null | undefined)[][],
  headers: string[],
): void {
  const escape = (c: unknown) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map(r => r.map(escape).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
