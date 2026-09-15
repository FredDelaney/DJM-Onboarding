export type RosterMigrationParseResult = {
  rows: Array<{
    raw: Record<string, string>;
    normalized: Record<string, unknown>;
  }>;
  headers: string[];
  fieldMapping: Record<string, string>;
  errors: string[];
};

const parseCsvRows = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  if (quoted) {
    throw new Error('CSV contains an unclosed quoted field.');
  }

  return rows;
};

const headerKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const listValue = (value: string) =>
  value
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);

const ALIASES: Record<string, string> = {
  player: 'full_name',
  player_name: 'full_name',
  name: 'full_name',
  full_name: 'full_name',
  first: 'first_name',
  first_name: 'first_name',
  firstname: 'first_name',
  surname: 'last_name',
  last: 'last_name',
  last_name: 'last_name',
  lastname: 'last_name',
  preferred_name: 'preferred_name',
  known_as: 'preferred_name',
  dob: 'date_of_birth',
  birth_date: 'date_of_birth',
  date_of_birth: 'date_of_birth',
  nationality: 'nationalities',
  nationalities: 'nationalities',
  height: 'height_cm',
  height_cm: 'height_cm',
  foot: 'preferred_foot',
  preferred_foot: 'preferred_foot',
  position: 'primary_position',
  primary_position: 'primary_position',
  secondary_position: 'secondary_positions',
  secondary_positions: 'secondary_positions',
  club: 'current_club',
  current_club: 'current_club',
  league: 'current_league',
  current_league: 'current_league',
  country: 'current_country',
  current_country: 'current_country',
  status: 'football_status',
  football_status: 'football_status',
  contract_status: 'contract_status',
  contract_expiry: 'contract_expiry',
  contract_end: 'contract_expiry',
  transfermarkt: 'transfermarkt_url',
  transfermarkt_url: 'transfermarkt_url',
  wyscout: 'wyscout_url',
  wyscout_url: 'wyscout_url',
  instagram: 'instagram_url',
  instagram_url: 'instagram_url',
};

const splitFullName = (normalized: Record<string, unknown>) => {
  if (
    String(normalized.first_name || '').trim() ||
    String(normalized.last_name || '').trim()
  ) {
    delete normalized.full_name;
    return;
  }

  const fullName = String(normalized.full_name || '').trim();
  if (!fullName) return;

  const parts = fullName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    normalized.first_name = parts[0];
  } else {
    normalized.first_name = parts.slice(0, -1).join(' ');
    normalized.last_name = parts.at(-1);
  }

  delete normalized.full_name;
};

export function parseRosterMigrationCsv(
  text: string,
): RosterMigrationParseResult {
  const csv = parseCsvRows(text.replace(/^\uFEFF/, ''));

  if (csv.length < 2) {
    throw new Error('CSV needs a header row and at least one data row.');
  }

  const rawHeaders = csv[0].map((value) => value.trim());
  const canonicalHeaders = rawHeaders.map(
    (value) => ALIASES[headerKey(value)] || headerKey(value),
  );

  const fieldMapping: Record<string, string> = {};
  rawHeaders.forEach((header, index) => {
    if (header) fieldMapping[header] = canonicalHeaders[index];
  });

  const errors: string[] = [];

  const rows = csv
    .slice(1)
    .map((cells, rowIndex) => {
      const raw: Record<string, string> = {};
      const normalized: Record<string, unknown> = {};

      rawHeaders.forEach((header, columnIndex) => {
        const value = String(cells[columnIndex] || '').trim();
        if (header) raw[header] = value;
        if (!value) return;

        const target = canonicalHeaders[columnIndex];
        if (!target) return;

        if (
          target === 'nationalities' ||
          target === 'secondary_positions'
        ) {
          normalized[target] = listValue(value);
        } else {
          normalized[target] = value;
        }
      });

      splitFullName(normalized);

      if (
        !String(normalized.first_name || '').trim() &&
        !String(normalized.last_name || '').trim() &&
        !String(normalized.preferred_name || '').trim()
      ) {
        errors.push(`Row ${rowIndex + 2}: player name is required.`);
      }

      return { raw, normalized };
    })
    .filter((row) =>
      Object.values(row.raw).some((value) => value.trim()),
    );

  return {
    rows,
    headers: rawHeaders,
    fieldMapping,
    errors,
  };
}

export const rosterMigrationTemplate = [
  'First Name,Last Name,Position,Current Club,Current League,Current Country,Date of Birth,Nationalities,Preferred Foot,Height CM,Contract Status,Contract Expiry,Transfermarkt URL',
  'Alex,Example,RW,Example FC,Premier Division,Netherlands,2001-04-12,Netherlands;Belgium,Right,181,Under contract,2027-06-30,https://www.transfermarkt.com/example',
].join('\n');
