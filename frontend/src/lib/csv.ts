// Tiny RFC 4180-compliant CSV parser / serializer.
// Handles quoted fields, embedded quotes ("" → "), CRLF or LF line endings,
// and trims trailing all-empty rows. No external dependency.

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i += 1;
      } else {
        cell += c; i += 1;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; i += 1; }
    else if (c === ',') { row.push(cell); cell = ''; i += 1; }
    else if (c === '\r') { i += 1; /* swallow; LF will close the row */ }
    else if (c === '\n') {
      row.push(cell); rows.push(row);
      row = []; cell = ''; i += 1;
    }
    else { cell += c; i += 1; }
  }

  // Final row (file may not end with newline)
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }

  // Trim trailing blank rows
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) {
    rows.pop();
  }
  return rows;
}

export function serializeCSV(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) => row
      .map((cell) => {
        const s = String(cell);
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(','))
    .join('\n');
}
