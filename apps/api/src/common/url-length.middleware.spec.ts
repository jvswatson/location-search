import type { NextFunction, Request, Response } from 'express';
import { rejectLongUrls } from './url-length.middleware.js';

function run(originalUrl: string, max: number) {
  const res = { status: vi.fn(), type: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const next = vi.fn();
  rejectLongUrls(max)(
    { originalUrl } as Request,
    res as unknown as Response,
    next as unknown as NextFunction,
  );
  return { res, next };
}

describe('rejectLongUrls', () => {
  it('passes a URL at exactly the limit through', () => {
    const url = `/api/v1/airports?q=${'a'.repeat(100 - 19)}`;
    expect(url).toHaveLength(100);
    const { res, next } = run(url, 100);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 414 in the standard error shape one character over, without calling next', () => {
    const { res, next } = run(`/${'a'.repeat(100)}`, 100);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(414);
    expect(res.type).toHaveBeenCalledWith('application/json');
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 414,
      error: 'URI Too Long',
      message: 'Request URL is 101 characters; the limit is 100',
    });
  });
});
