import { describe, it, expect } from 'vitest';
import { HttpError, buildApiError } from '../../src/lib/errors.js';

describe('HttpError', () => {
  it('carries status, message, and type', () => {
    const err = new HttpError({ message: 'Not found', status: 404, type: 'not_found_error' });
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.type).toBe('not_found_error');
  });

  it('optionally carries a code', () => {
    const err = new HttpError({ message: 'Bad', status: 400, type: 'bad_request', code: 'missing_param' });
    expect(err.code).toBe('missing_param');
  });

  it('toJson() returns the OpenAI-style shape', () => {
    const err = new HttpError({ message: 'Oops', status: 500, type: 'server_error' });
    expect(err.toJson()).toEqual({ error: { message: 'Oops', type: 'server_error' } });
  });

  it('toJson() includes code when present', () => {
    const err = new HttpError({ message: 'Oops', status: 500, type: 'server_error', code: 'rate_limited' });
    expect(err.toJson()).toEqual({ error: { message: 'Oops', type: 'server_error', code: 'rate_limited' } });
  });
});

describe('buildApiError', () => {
  it('returns correct shape without code', () => {
    expect(buildApiError('fail', 'request_error')).toEqual({
      error: { message: 'fail', type: 'request_error' },
    });
  });

  it('includes code only when provided', () => {
    expect(buildApiError('fail', 'request_error', '400')).toEqual({
      error: { message: 'fail', type: 'request_error', code: '400' },
    });
  });
});
