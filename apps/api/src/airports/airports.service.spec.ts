import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AirportRow, AirportsRepository } from './airports.repository.js';
import { AirportsService, roundMiles, toAirportDto } from './airports.service.js';

const row = (icao: string, extra: Partial<AirportRow> = {}): AirportRow => ({
  icao_code: icao,
  iata_code: null,
  name: `Airport ${icao}`,
  city: 'City',
  country: 'Country',
  altitude_ft: 10,
  lat: 1,
  lng: 2,
  ...extra,
});

function setup() {
  const repo = {
    search: vi.fn(),
    points: vi.fn(),
    findByIcao: vi.fn(),
    nearest: vi.fn(),
    distance: vi.fn(),
    countries: vi.fn(),
  };
  return { repo, service: new AirportsService(repo as unknown as AirportsRepository) };
}

describe('roundMiles / toAirportDto', () => {
  it('rounds meters to 0.1 mi', () => {
    expect(roundMiles(1609.344)).toBe(1);
    expect(roundMiles(1609.344 * 2.349)).toBe(2.3);
    expect(roundMiles(1609.344 * 2.35)).toBe(2.4);
    expect(roundMiles(0)).toBe(0);
  });

  it('maps a row to the contract, adding distanceMi only when the row has a distance', () => {
    expect(toAirportDto(row('EGLL', { iata_code: 'LHR' }))).toEqual({
      icaoCode: 'EGLL',
      iataCode: 'LHR',
      name: 'Airport EGLL',
      city: 'City',
      country: 'Country',
      altitudeFt: 10,
      lat: 1,
      lng: 2,
    });
    expect(toAirportDto(row('EGLL', { distance_m: 16093.44 })).distanceMi).toBe(10);
    expect(toAirportDto(row('EGLL', { distance_m: 0 })).distanceMi).toBe(0);
  });
});

describe('AirportsService', () => {
  it('search resolves criteria, then builds page meta from the total', async () => {
    const { repo, service } = setup();
    repo.search.mockResolvedValue({ rows: [row('AAAA')], total: 51 });

    const result = await service.search({ q: 'x', page: 2, limit: 25 });

    expect(repo.search).toHaveBeenCalledWith({
      q: 'x',
      sort: 'relevance',
      order: 'desc',
      page: 2,
      limit: 25,
    });
    expect(result.meta).toEqual({ total: 51, page: 2, limit: 25, pageCount: 3 });
    expect(result.data.map((a) => a.icaoCode)).toEqual(['AAAA']);
  });

  it('search reports the distance reference point as meta.center (rounded to 5 dp)', async () => {
    const { repo, service } = setup();
    repo.search.mockResolvedValue({ rows: [], total: 0 });

    const boxed = await service.search({ bbox: '-0.123456,51.1,0.2,51.9' });
    expect(boxed.meta.center).toEqual({ lat: 51.5, lng: 0.03827 });
    expect(repo.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ bbox: [-0.123456, 51.1, 0.2, 51.9], sort: 'distance' }),
    );

    const radius = await service.search({ lat: 40.64, lng: -73.779, radiusMi: 10 });
    expect(radius.meta.center).toEqual({ lat: 40.64, lng: -73.779 });
  });

  it('search reports zero pages for no matches', async () => {
    const { repo, service } = setup();
    repo.search.mockResolvedValue({ rows: [], total: 0 });
    expect((await service.search({})).meta).toEqual({ total: 0, page: 1, limit: 25, pageCount: 0 });
  });

  it('search rejects inconsistent input before touching the database', async () => {
    const { repo, service } = setup();
    await expect(service.search({ sort: 'relevance' })).rejects.toThrow(BadRequestException);
    await expect(service.search({ lat: 1 })).rejects.toThrow(BadRequestException);
    expect(repo.search).not.toHaveBeenCalled();
  });

  it('points returns every row with the count', async () => {
    const { repo, service } = setup();
    repo.points.mockResolvedValue([
      { icao_code: 'AAAA', lat: 1, lng: 2 },
      { icao_code: 'BBBB', lat: 3, lng: 4 },
    ]);
    expect(await service.points({ country: ['X'] })).toEqual({
      data: [
        { icaoCode: 'AAAA', lat: 1, lng: 2 },
        { icaoCode: 'BBBB', lat: 3, lng: 4 },
      ],
      total: 2,
    });
    expect(repo.points).toHaveBeenCalledWith({ countries: ['X'] });
    await expect(service.points({ minAltitudeFt: 2, maxAltitudeFt: 1 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('findOne 404s on unknown codes', async () => {
    const { repo, service } = setup();
    repo.findByIcao.mockResolvedValue(null);
    await expect(service.findOne('ZZZZ')).rejects.toThrow(
      new NotFoundException('Airport ZZZZ not found'),
    );
  });

  it('nearest checks the origin first and maps neighbours with distances', async () => {
    const { repo, service } = setup();
    repo.findByIcao.mockResolvedValue(row('EGLL'));
    repo.nearest.mockResolvedValue([row('EGWU', { distance_m: 9012.3264 })]);

    const result = await service.nearest('EGLL', 1);

    expect(repo.nearest).toHaveBeenCalledWith('EGLL', 1);
    expect(result.origin.icaoCode).toBe('EGLL');
    expect(result.data).toEqual([expect.objectContaining({ icaoCode: 'EGWU', distanceMi: 5.6 })]);

    repo.findByIcao.mockResolvedValue(null);
    await expect(service.nearest('ZZZZ')).rejects.toThrow(NotFoundException);
  });

  it('distance rounds to 0.1 mi and names whichever codes are unknown', async () => {
    const { repo, service } = setup();
    repo.distance.mockResolvedValue({ hasFrom: true, hasTo: true, meters: 5_554_000 });
    expect(await service.distance('EGLL', 'KJFK')).toEqual({
      from: 'EGLL',
      to: 'KJFK',
      distanceMi: 3451.1,
    });

    repo.distance.mockResolvedValue({ hasFrom: false, hasTo: true, meters: null });
    await expect(service.distance('ZZZZ', 'KJFK')).rejects.toThrow('Airport not found: ZZZZ');
    repo.distance.mockResolvedValue({ hasFrom: false, hasTo: false, meters: null });
    await expect(service.distance('ZZZZ', 'YYYY')).rejects.toThrow('Airport not found: ZZZZ, YYYY');
    await expect(service.distance('ZZZZ', 'ZZZZ')).rejects.toThrow('Airport not found: ZZZZ');
  });

  it('reports the polygon centroid as meta.center and defaults to distance', async () => {
    const { repo, service } = setup();
    repo.search.mockResolvedValue({ rows: [], total: 0 });
    const result = await service.search({ polygon: '-10,-10;10,-10;10,10;-10,10' });
    expect(result.meta.center).toEqual({ lat: 0, lng: 0 });
    expect(repo.search).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'distance', polygon: expect.any(Array) }),
    );
  });

  it('countries delegates to the repository', async () => {
    const { repo, service } = setup();
    repo.countries.mockResolvedValue([{ country: 'X', count: 1 }]);
    expect(await service.countries()).toEqual([{ country: 'X', count: 1 }]);
  });
});
