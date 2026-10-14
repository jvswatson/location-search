import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Client errors (incl. 429) won't improve by retrying immediately.
        retry: (count, err) =>
          count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      },
    },
  });
}
