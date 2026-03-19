const LOCATION_ID_HEADERS = ['subaccount_id', 'sub_account_id', 'location_id', 'ghl_location_id', 'id'];
const NAME_HEADERS = ['subaccount_name', 'sub_account_name', 'name', 'location_name', 'company_name'];
const TOKEN_HEADERS = ['private_integration_token', 'pit', 'token', 'pit_token', 'api_key'];

export interface ParsedPitRow {
  locationId: string;
  name: string;
  token: string;
  rowNumber: number;
}

export interface ParseResult {
  rows: ParsedPitRow[];
  skippedRows: Array<{ rowNumber: number; reason: string }>;
  errors: string[];
  delimiter: string;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parsePitCsv(csvText: string): ParseResult {
  const result: ParseResult = { rows: [], skippedRows: [], errors: [], delimiter: ',' };

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim());

  if (lines.length < 2) {
    result.errors.push('CSV must have a header row and at least one data row');
    return result;
  }

  // Auto-detect delimiter
  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  result.delimiter = tabCount > commaCount ? '\t' : ',';

  // Parse header
  const headers = splitCsvLine(headerLine, result.delimiter).map((h) => h.trim().toLowerCase());

  const idCol = headers.findIndex((h) => LOCATION_ID_HEADERS.includes(h));
  const nameCol = headers.findIndex((h) => NAME_HEADERS.includes(h));
  const tokenCol = headers.findIndex((h) => TOKEN_HEADERS.includes(h));

  if (idCol === -1) {
    result.errors.push(`Missing location ID column. Expected: ${LOCATION_ID_HEADERS.join(', ')}`);
    return result;
  }
  if (tokenCol === -1) {
    result.errors.push(`Missing token column. Expected: ${TOKEN_HEADERS.join(', ')}`);
    return result;
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], result.delimiter).map((c) => c.trim());
    const rowNum = i + 1;
    const locationId = cols[idCol] || '';
    const name = nameCol !== -1 ? cols[nameCol] || '' : '';
    const token = cols[tokenCol] || '';

    if (!locationId) {
      result.skippedRows.push({ rowNumber: rowNum, reason: 'Empty location ID' });
      continue;
    }
    if (!token) {
      result.skippedRows.push({ rowNumber: rowNum, reason: 'Empty token' });
      continue;
    }

    result.rows.push({ locationId, name, token, rowNumber: rowNum });
  }

  return result;
}

export function maskToken(token: string): string {
  if (token.length <= 4) return token;
  return token.slice(0, 4) + '\u2022'.repeat(Math.min(token.length - 4, 12));
}
