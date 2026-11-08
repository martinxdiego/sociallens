export const number = (value: number) => value.toLocaleString('de-CH');
export const dateTime = (value: string) =>
  new Date(value).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'medium' });
export const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });

export function downloadFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(rows: string[][], name: string) {
  // Spreadsheet formulas must remain literal, including user-authored notes.
  const cell = (value: string) =>
    `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  downloadFile(
    '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'),
    name,
    'text/csv;charset=utf-8'
  );
}
