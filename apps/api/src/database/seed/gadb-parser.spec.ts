import { GadbParseError, parseGadbSql } from './gadb-parser.js';

const GOROKA = `insert into airports values ('AYGA', 'GKA', 'GOROKA', 'GOROKA', 'PAPUA NEW GUINEA', 006, 004, 054, 'S', 145, 023, 030, 'E', 01610, -6.082, 145.392);`;

describe('parseGadbSql', () => {
  it('parses every column of an insert statement', () => {
    expect(parseGadbSql(GOROKA)).toEqual([
      {
        icaoCode: 'AYGA',
        iataCode: 'GKA',
        name: 'GOROKA',
        city: 'GOROKA',
        country: 'PAPUA NEW GUINEA',
        latDeg: 6,
        latMin: 4,
        latSec: 54,
        latDir: 'S',
        lonDeg: 145,
        lonMin: 23,
        lonSec: 30,
        lonDir: 'E',
        altitudeM: 1610,
        latDecimal: -6.082,
        lonDecimal: 145.392,
      },
    ]);
  });

  it('ignores comments, CREATE TABLE and blank lines', () => {
    const sql = `/*\n  license\n*/\ncreate table airports (\n  icao_code char(4)\n);\n\n${GOROKA}\n`;
    expect(parseGadbSql(sql)).toHaveLength(1);
  });

  it("unescapes doubled quotes ('')", () => {
    const sql = `insert into airports values ('EGHC', 'N/A', 'N/A', 'LAND''S END', 'ENGLAND', 000, 000, 000, 'U', 000, 000, 000, 'U', 00000, 0.000, 0.000);`;
    expect(parseGadbSql(sql)[0]?.city).toBe("LAND'S END");
  });

  it('parses negative altitudes', () => {
    const sql = GOROKA.replace('01610', '-0385');
    expect(parseGadbSql(sql)[0]?.altitudeM).toBe(-385);
  });

  it('handles CRLF line endings', () => {
    expect(parseGadbSql(`${GOROKA}\r\n${GOROKA}\r\n`)).toHaveLength(2);
  });

  it.each([
    ['too few values', GOROKA.replace(', 145.392);', ');')],
    ['unterminated string', GOROKA.replace("'GOROKA', 'GOROKA'", "'GOROKA, 'GOROKA'")],
    ['missing terminator', GOROKA.slice(0, -2)],
    ['number where a string belongs', GOROKA.replace("'AYGA'", '1234')],
  ])('reports the line number for %s', (_label, bad) => {
    const sql = `-- header\n${bad}`;
    expect(() => parseGadbSql(sql)).toThrow(GadbParseError);
    expect(() => parseGadbSql(sql)).toThrow(/^line 2:/);
  });
});
