/** One row of the Global Airport Database, exactly as it appears in the source SQL. */
export interface GadbRow {
  icaoCode: string;
  iataCode: string;
  name: string;
  city: string;
  country: string;
  latDeg: number;
  latMin: number;
  latSec: number;
  latDir: string;
  lonDeg: number;
  lonMin: number;
  lonSec: number;
  lonDir: string;
  altitudeM: number;
  latDecimal: number;
  lonDecimal: number;
}

export class GadbParseError extends Error {
  constructor(
    readonly lineNumber: number,
    message: string,
  ) {
    super(`line ${lineNumber}: ${message}`);
    this.name = 'GadbParseError';
  }
}

const INSERT_PREFIX = 'insert into airports values (';
const COLUMN_COUNT = 16;

/**
 * Parses the GADB `insert into airports values (...);` statements. The file is treated as data and
 * never executed. Every other line (license comment, CREATE TABLE) is ignored.
 */
export function parseGadbSql(sql: string): GadbRow[] {
  const rows: GadbRow[] = [];
  sql.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith(INSERT_PREFIX)) return;
    rows.push(parseInsertLine(line, index + 1));
  });
  return rows;
}

function parseInsertLine(line: string, lineNumber: number): GadbRow {
  if (!line.endsWith(');')) {
    throw new GadbParseError(lineNumber, 'statement does not end with ");"');
  }
  const values = tokenizeValues(line.slice(INSERT_PREFIX.length, -2), lineNumber);
  if (values.length !== COLUMN_COUNT) {
    throw new GadbParseError(lineNumber, `expected ${COLUMN_COUNT} values, got ${values.length}`);
  }

  const str = (i: number): string => {
    const v = values[i]!;
    if (v.kind !== 'string')
      throw new GadbParseError(lineNumber, `value ${i + 1} must be a string`);
    return v.value;
  };
  const num = (i: number): number => {
    const v = values[i]!;
    if (v.kind !== 'number')
      throw new GadbParseError(lineNumber, `value ${i + 1} must be a number`);
    return v.value;
  };

  return {
    icaoCode: str(0),
    iataCode: str(1),
    name: str(2),
    city: str(3),
    country: str(4),
    latDeg: num(5),
    latMin: num(6),
    latSec: num(7),
    latDir: str(8),
    lonDeg: num(9),
    lonMin: num(10),
    lonSec: num(11),
    lonDir: str(12),
    altitudeM: num(13),
    latDecimal: num(14),
    lonDecimal: num(15),
  };
}

type Token = { kind: 'string'; value: string } | { kind: 'number'; value: number };

/** Splits a SQL VALUES list into string literals ('' is an escaped quote) and numbers. */
function tokenizeValues(body: string, lineNumber: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const skipSpaces = () => {
    while (body[i] === ' ' || body[i] === '\t') i++;
  };

  while (i < body.length) {
    skipSpaces();
    if (body[i] === "'") {
      let value = '';
      i++;
      for (;;) {
        if (i >= body.length) throw new GadbParseError(lineNumber, 'unterminated string literal');
        if (body[i] === "'") {
          if (body[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += body[i++];
      }
      tokens.push({ kind: 'string', value });
    } else {
      const match = /^-?\d+(\.\d+)?/.exec(body.slice(i));
      if (!match) throw new GadbParseError(lineNumber, `unexpected input at column ${i + 1}`);
      tokens.push({ kind: 'number', value: Number(match[0]) });
      i += match[0].length;
    }

    skipSpaces();
    if (i < body.length) {
      if (body[i] !== ',') throw new GadbParseError(lineNumber, `expected "," at column ${i + 1}`);
      i++;
    }
  }
  return tokens;
}
