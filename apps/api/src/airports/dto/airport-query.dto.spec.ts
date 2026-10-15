import 'reflect-metadata';
import { BadRequestException, type Type } from '@nestjs/common';
import {
  MAX_COUNTRIES,
  MAX_PAGE_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_RADIUS_MI,
  MIN_RADIUS_MI,
} from '@location-search/shared';
import { createValidationPipe } from '../../common/validation.js';
import { AirportFiltersQueryDto, AirportSearchQueryDto } from './airport-query.dto.js';
import { DistanceQueryDto, IcaoParamDto, NearestQueryDto, WithinRequestDto } from './params.dto.js';

const pipe = createValidationPipe();

/** Runs the real global pipe the way Nest does for a @Query()/@Param()/@Body() argument. */
async function validate<T>(
  metatype: Type<T>,
  value: unknown,
  type: 'query' | 'param' | 'body' = 'query',
): Promise<T> {
  return pipe.transform(value, { type, metatype });
}

async function messages(metatype: Type<unknown>, value: unknown, type?: 'query' | 'body') {
  try {
    await validate(metatype, value, type);
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).getResponse() as { message: string[] };
  }
  throw new Error('expected validation to fail');
}

describe('AirportSearchQueryDto', () => {
  it('accepts an empty query', async () => {
    expect(await validate(AirportSearchQueryDto, {})).toEqual({});
  });

  it('converts query strings to typed values', async () => {
    const dto = await validate(AirportSearchQueryDto, {
      q: '  heathrow ',
      country: 'France',
      iata: 'lhr',
      hasIata: 'false',
      minAltitudeFt: '-100',
      maxAltitudeFt: '5000',
      lat: '51.5',
      lng: '-0.12',
      radiusMi: '25',
      bbox: '-1,51,1,52',
      sort: 'distance',
      order: 'desc',
      page: '2',
      limit: '10',
      format: 'geojson',
    });
    expect({ ...dto }).toEqual({
      q: 'heathrow',
      country: ['France'],
      iata: 'LHR',
      hasIata: false,
      minAltitudeFt: -100,
      maxAltitudeFt: 5000,
      lat: 51.5,
      lng: -0.12,
      radiusMi: 25,
      bbox: '-1,51,1,52',
      sort: 'distance',
      order: 'desc',
      page: 2,
      limit: 10,
      format: 'geojson',
    });
  });

  it('accepts repeated country values', async () => {
    const dto = await validate(AirportSearchQueryDto, { country: ['France', ' Spain '] });
    expect(dto.country).toEqual(['France', 'Spain']);
  });

  it(`accepts up to ${MAX_COUNTRIES} countries and rejects more`, async () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `Country ${i}`);
    expect(
      (await validate(AirportSearchQueryDto, { country: names(MAX_COUNTRIES) })).country,
    ).toHaveLength(MAX_COUNTRIES);
    const { message } = await messages(AirportSearchQueryDto, {
      country: names(MAX_COUNTRIES + 1),
    });
    expect(message).toEqual([`country accepts at most ${MAX_COUNTRIES} values`]);
  });

  it.each([
    [{ q: '   ' }, /q should not be empty/],
    [{ q: 'x'.repeat(MAX_QUERY_LENGTH + 1) }, /q must be shorter/],
    [{ iata: 'LHRX' }, /iata must be 3 letters/],
    [{ hasIata: 'yes' }, /hasIata must be a boolean/],
    [{ minAltitudeFt: '1.5' }, /minAltitudeFt must be an integer/],
    [{ lat: '91' }, /lat must be a latitude/],
    [{ lng: 'abc' }, /lng must be a number/],
    [{ radiusMi: String(MIN_RADIUS_MI - 0.5) }, /radiusMi must not be less than/],
    [{ radiusMi: String(MAX_RADIUS_MI + 1) }, /radiusMi must not be greater than/],
    [{ bbox: '1,2,3' }, /four comma-separated/],
    [{ bbox: '0,0,-1,1' }, /minLng must be less than maxLng/],
    [{ bbox: ['1,2,3,4', '1,2,3,4'] }, /bbox must be a single string/],
    [{ sort: 'popularity' }, /sort must be one of/],
    [{ order: 'up' }, /order must be one of/],
    [{ page: '0' }, /page must not be less than 1/],
    [{ limit: String(MAX_PAGE_LIMIT + 1) }, /limit must not be greater than/],
    [{ format: 'xml' }, /format must be one of/],
    [{ country: [''] }, /country should not be empty/],
  ])('rejects %j', async (query, pattern) => {
    const { message } = await messages(AirportSearchQueryDto, query);
    expect(message.join('\n')).toMatch(pattern);
  });

  it('accepts the radius bounds themselves', async () => {
    await expect(
      validate(AirportSearchQueryDto, { radiusMi: String(MIN_RADIUS_MI) }),
    ).resolves.toBeTruthy();
    await expect(
      validate(AirportSearchQueryDto, { radiusMi: String(MAX_RADIUS_MI) }),
    ).resolves.toBeTruthy();
  });

  it('rejects unknown parameters', async () => {
    const { message } = await messages(AirportSearchQueryDto, { foo: '1' });
    expect(message).toEqual(['property foo should not exist']);
  });

  it('reports every invalid field together', async () => {
    const { message } = await messages(AirportSearchQueryDto, { lat: 'x', page: '0', sort: 'y' });
    expect(message.length).toBeGreaterThanOrEqual(3);
  });
});

describe('AirportFiltersQueryDto', () => {
  it('does not accept paging or sorting (points returns every match)', async () => {
    const { message } = await messages(AirportFiltersQueryDto, { page: '1', sort: 'name' });
    expect(message).toEqual(
      expect.arrayContaining(['property page should not exist', 'property sort should not exist']),
    );
  });
});

describe('IcaoParamDto / DistanceQueryDto / NearestQueryDto', () => {
  it('uppercases ICAO codes', async () => {
    expect((await validate(IcaoParamDto, { icao: 'egll' }, 'param')).icao).toBe('EGLL');
    expect({ ...(await validate(DistanceQueryDto, { from: 'egll', to: ' kjfk ' })) }).toEqual({
      from: 'EGLL',
      to: 'KJFK',
    });
  });

  it('rejects malformed codes and missing distance ends', async () => {
    expect((await messages(IcaoParamDto, { icao: 'EGL' })).message).toEqual([
      'icao must be a 4-character ICAO code',
    ]);
    expect((await messages(DistanceQueryDto, { from: 'EGLL' })).message).toContain(
      'to must be a 4-character ICAO code',
    );
  });

  it('bounds k', async () => {
    expect((await validate(NearestQueryDto, { k: '5' })).k).toBe(5);
    expect((await messages(NearestQueryDto, { k: '0' })).message[0]).toMatch(/k must not be less/);
    expect((await messages(NearestQueryDto, { k: '51' })).message[0]).toMatch(
      /k must not be greater/,
    );
  });
});

describe('WithinRequestDto', () => {
  const ring = [
    [-1, 51],
    [1, 51],
    [1, 52],
    [-1, 52],
    [-1, 51],
  ];

  it('accepts a GeoJSON polygon', async () => {
    const dto = await validate(WithinRequestDto, { type: 'Polygon', coordinates: [ring] }, 'body');
    expect(dto.coordinates).toEqual([ring]);
  });

  it('rejects other geometry types, open rings and foreign members', async () => {
    expect(
      (await messages(WithinRequestDto, { type: 'Point', coordinates: [ring] }, 'body')).message,
    ).toEqual(["type must be 'Polygon'"]);
    const open = { type: 'Polygon', coordinates: [ring.slice(0, 4).concat([[0, 51.5]])] };
    expect((await messages(WithinRequestDto, open, 'body')).message).toEqual([
      'exterior ring must be closed (first and last positions equal)',
    ]);
    const extra = { type: 'Polygon', coordinates: [ring], crs: {} };
    expect((await messages(WithinRequestDto, extra, 'body')).message).toEqual([
      'property crs should not exist',
    ]);
  });
});
