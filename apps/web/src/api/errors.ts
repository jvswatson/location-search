import { ApiError } from './client';

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many requests. Please wait a moment and try again.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
