import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AirportSearchParams } from '@location-search/shared';
import { fetchAirportPoints, fetchAirports, fetchCountries } from './client';

export function useAirports(params: AirportSearchParams) {
  return useQuery({
    queryKey: ['airports', params],
    queryFn: ({ signal }) => fetchAirports(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Pins for every match. Never requested while `enabled` is false (no filter active). */
export function useAirportPoints(params: AirportSearchParams, enabled: boolean) {
  return useQuery({
    queryKey: ['points', params],
    queryFn: ({ signal }) => fetchAirportPoints(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: ({ signal }) => fetchCountries(signal),
    staleTime: Infinity,
  });
}
