import { HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { toErrorResponse } from './http-exception.filter.js';

/**
 * Rejects requests whose URL (path + query) is longer than `maxLength` with a 414 in the standard
 * error shape. Registered first, so oversize requests never reach rate limiting, static files,
 * validation or the database. Node itself only refuses at 16 KiB of request line + headers (431);
 * this is a deliberately lower, documented limit shared with the web client.
 */
export function rejectLongUrls(maxLength: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.originalUrl.length <= maxLength) {
      next();
      return;
    }
    const body = toErrorResponse(
      new HttpException(
        `Request URL is ${req.originalUrl.length} characters; the limit is ${maxLength}`,
        HttpStatus.URI_TOO_LONG,
      ),
    );
    res.status(body.statusCode).type('application/json').json(body);
  };
}
