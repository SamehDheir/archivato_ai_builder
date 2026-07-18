import { normalizeApiModule, type ApiModule } from '@archivato/shared';

/** Build a module whose endpoints carry the given raw paths. */
function paths(basePath: string, raw: string[]): string[] {
  const module = {
    name: 'M',
    basePath,
    endpoints: raw.map((path) => ({
      method: 'GET',
      path,
      summary: '',
      requestSchema: [],
      responseSchema: [],
      statusCodes: [200],
    })),
  } as unknown as ApiModule;
  return normalizeApiModule(module).endpoints.map((e) => e.path);
}

describe('endpoint paths are forced absolute', () => {
  it('leaves an already-absolute path alone', () => {
    expect(paths('/api/clinics', ['/api/clinics', '/api/clinics/:id'])).toEqual([
      '/api/clinics',
      '/api/clinics/:id',
    ]);
  });

  it('repairs the mixed conventions a real design shipped with', () => {
    // One module carried the collection as an absolute path and the item as a
    // bare "/:id" — the OpenAPI export then published "/{id}" as a root route.
    expect(paths('/api/clinics', ['/api/clinics', '/:id'])).toEqual([
      '/api/clinics',
      '/api/clinics/:id',
    ]);
  });

  it('resolves a root-relative collection path', () => {
    expect(paths('/api/appointments', ['/', '/:appointmentId'])).toEqual([
      '/api/appointments',
      '/api/appointments/:appointmentId',
    ]);
  });

  it('resolves a nested relative path', () => {
    expect(paths('/api/bills', ['/:billId/payments'])).toEqual([
      '/api/bills/:billId/payments',
    ]);
  });

  it('resolves auth-style relative paths', () => {
    expect(paths('/api/auth', ['/register', '/login', '/refresh'])).toEqual([
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/refresh',
    ]);
  });

  it('does not double up a relative path that repeats its resource', () => {
    expect(paths('/api/orders', ['/orders/:id'])).toEqual(['/api/orders/:id']);
  });

  it('falls back to the basePath for an empty path', () => {
    expect(paths('/api/clinics', [''])).toEqual(['/api/clinics']);
  });

  it('tolerates a basePath carrying regex metacharacters', () => {
    // basePath is LLM output; building a RegExp from it would throw here.
    expect(() => paths('/api/a(b)[c].d', ['/:id'])).not.toThrow();
    expect(paths('/api/a(b)[c].d', ['/:id'])).toEqual(['/api/a(b)[c].d/:id']);
  });

  it('handles a missing basePath without producing a relative path', () => {
    expect(paths('', ['users/:id'])).toEqual(['/users/:id']);
  });
});
