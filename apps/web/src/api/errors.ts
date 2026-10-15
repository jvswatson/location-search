import { ApiError, REQUEST_TOO_LARGE_MESSAGE } from './client';

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (err.status === 414) return REQUEST_TOO_LARGE_MESSAGE;
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
