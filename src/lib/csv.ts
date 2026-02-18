/**
 * Parse CSV text into a 2D array of strings.
 * Handles quoted fields, commas inside quotes, CRLF/LF, and double-quote escaping.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped double-quote
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\r") {
        // CRLF or bare CR
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
        if (i < text.length && text[i] === "\n") i++;
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Final field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Convert a 2D array (from parseCSV) into a markdown table string.
 * First row is treated as header. Pipe chars in cell values are escaped.
 */
export function csvToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";

  const escape = (cell: string) => cell.replace(/\|/g, "\\|").trim();

  const header = rows[0];
  const dataRows = rows.slice(1);

  const lines: string[] = [];
  lines.push("| " + header.map(escape).join(" | ") + " |");
  lines.push("| " + header.map(() => "---").join(" | ") + " |");

  for (const row of dataRows) {
    // Pad row to match header length if needed
    const padded = [...row];
    while (padded.length < header.length) padded.push("");
    lines.push("| " + padded.map(escape).join(" | ") + " |");
  }

  return lines.join("\n");
}
