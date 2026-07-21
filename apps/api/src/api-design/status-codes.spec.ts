import { normalizeStatusCodes, normalizeApiEndpoint } from '@archivato/shared';

/**
 * Bug T: some endpoints rendered status codes as one run-together number
 * (`201400409`) while siblings rendered `200 400 409` correctly. The container
 * was an array, but its contents were malformed — a concatenated int, a digit
 * string, or a CSV string — and nothing validated them. An HTTP code is exactly
 * three digits, so the repair is deterministic.
 */
describe('normalizeStatusCodes', () => {
  it('splits a concatenated integer into distinct codes', () => {
    expect(normalizeStatusCodes([201400409])).toEqual([201, 400, 409]);
    expect(normalizeStatusCodes([200400401404409])).toEqual([200, 400, 401, 404, 409]);
  });

  it('splits a concatenated digit string', () => {
    expect(normalizeStatusCodes('201400409')).toEqual([201, 400, 409]);
    expect(normalizeStatusCodes(['200400401'])).toEqual([200, 400, 401]);
  });

  it('parses a separated string (CSV or spaces)', () => {
    expect(normalizeStatusCodes('200, 400, 401')).toEqual([200, 400, 401]);
    expect(normalizeStatusCodes('201 400 409')).toEqual([201, 400, 409]);
  });

  it('leaves a well-formed array untouched (and dedupes)', () => {
    expect(normalizeStatusCodes([200, 400, 409])).toEqual([200, 400, 409]);
    expect(normalizeStatusCodes([200, 200, 404])).toEqual([200, 404]);
  });

  it('drops non-HTTP noise rather than rendering garbage', () => {
    expect(normalizeStatusCodes(undefined)).toEqual([]);
    expect(normalizeStatusCodes('n/a')).toEqual([]);
    expect(normalizeStatusCodes([42, 700, 200])).toEqual([200]); // out-of-range dropped
  });

  it('handles a mixed array of good and concatenated elements', () => {
    expect(normalizeStatusCodes([200, '400409', 404])).toEqual([200, 400, 409, 404]);
  });

  it('is applied by normalizeApiEndpoint at the store boundary', () => {
    const ep = normalizeApiEndpoint(
      {
        method: 'POST',
        path: '/api/auth/register',
        summary: '',
        requestSchema: [],
        responseSchema: [],
        statusCodes: '201400409' as unknown as number[],
      },
      '/api/auth',
    );
    expect(ep.statusCodes).toEqual([201, 400, 409]);
  });
});
