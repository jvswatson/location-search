import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorResponse } from '@location-search/shared';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

/** Normalizes any thrown value into the contract's `ErrorResponse`. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Internal Server Error',
      message: 'Internal server error',
    };
  }

  const statusCode = exception.getStatus();
  const error = STATUS_CODES[statusCode] ?? 'Error';
  const body = exception.getResponse();

  if (typeof body === 'string') return { statusCode, error, message: body };

  const { message } = body as { message?: unknown };
  const normalized =
    typeof message === 'string'
      ? message
      : Array.isArray(message) && message.every((m) => typeof m === 'string')
        ? message
        : exception.message;
  return { statusCode, error, message: normalized };
}

/**
 * Global filter so every non-2xx (validation, 404, 429, unexpected 500) has the same shape.
 * Unexpected errors are logged with their stack but never leak details to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = toErrorResponse(exception);

    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    if (res.headersSent) return;
    // A handler may have set application/geo+json before failing; errors are always JSON.
    res.status(body.statusCode).type('application/json').json(body);
  }
}
