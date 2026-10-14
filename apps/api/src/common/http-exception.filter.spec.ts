import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter, toErrorResponse } from './http-exception.filter.js';

describe('toErrorResponse', () => {
  it('keeps validation message arrays', () => {
    expect(toErrorResponse(new BadRequestException(['a is bad', 'b is bad']))).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['a is bad', 'b is bad'],
    });
  });

  it('normalizes a string message', () => {
    expect(toErrorResponse(new NotFoundException('Airport ZZZZ not found'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Airport ZZZZ not found',
    });
  });

  it('handles exceptions whose response is a bare string (e.g. the throttler)', () => {
    expect(toErrorResponse(new ThrottlerException('slow down'))).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'slow down',
    });
  });

  it('falls back to the exception message for odd response bodies', () => {
    expect(toErrorResponse(new HttpException({ detail: 'x' }, HttpStatus.CONFLICT))).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Http Exception',
    });
  });

  it('hides unexpected errors behind a generic 500', () => {
    expect(toErrorResponse(new Error('password=hunter2 leaked'))).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(toErrorResponse('a thrown string')).toMatchObject({ statusCode: 500 });
  });
});

describe('HttpExceptionFilter', () => {
  function fakeHost(headersSent = false) {
    const res = {
      headersSent,
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
    return { res, host };
  }

  it('writes the normalized body as JSON', () => {
    const { res, host } = fakeHost();
    new HttpExceptionFilter().catch(new NotFoundException('nope'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.type).toHaveBeenCalledWith('application/json');
    expect(res.json).toHaveBeenCalledWith({ statusCode: 404, error: 'Not Found', message: 'nope' });
  });

  it('logs 5xx errors and does not write after headers were sent', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host } = fakeHost(true);
    new HttpExceptionFilter().catch(new Error('boom'), host);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(res.json).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
