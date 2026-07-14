jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import * as Sentry from '@sentry/node';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost(originalUrl = '/api/thing'): {
  host: ArgumentsHost;
  res: { status: jest.Mock; json: jest.Mock };
} {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const req = { method: 'POST', originalUrl };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => jest.clearAllMocks());

  it('preserves an HttpException status + body and does not report 4xx', () => {
    const { host, res } = mockHost();
    filter.catch(new BadRequestException('bad email'), host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ message: 'bad email' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('returns a generic 500 for unknown errors and never leaks internals', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('secret db string at 10.0.0.1'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('reports 5xx HttpExceptions to Sentry', () => {
    const { host } = mockHost();
    filter.catch(new HttpException('upstream', HttpStatus.BAD_GATEWAY), host);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('wraps a string exception response into an object body', () => {
    const { host, res } = mockHost();
    filter.catch(new HttpException('teapot', 418), host);
    expect(res.json.mock.calls[0][0]).toEqual({
      statusCode: 418,
      message: 'teapot',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('never logs a share token — the URL param IS the credential', () => {
    const token = 'kHhK1Zt3s6vQ9wXyZ0aBcDeFgHiJkLmNoPqRsTuVwXy';
    const spy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const { host } = mockHost(`/api/shared/${token}`);
    filter.catch(new Error('boom'), host);

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain(token);
    expect(line).toContain('/api/shared/[token]');
    spy.mockRestore();
  });
});
