import { toYaml } from '@archivato/shared';

describe('toYaml', () => {
  it('serializes nested maps with block style', () => {
    expect(
      toYaml({ openapi: '3.0.3', info: { title: 'X', version: '0.1.0' } }),
    ).toBe(['openapi: 3.0.3', 'info:', '  title: X', '  version: 0.1.0', ''].join('\n'));
  });

  it('quotes only strings that would be ambiguous as plain scalars', () => {
    expect(
      toYaml({
        colon: 'has: colon',
        dash: '- dash',
        reserved: 'true',
        numeric: '200',
        hash: 'a#b',
        text: 'plain text',
      }),
    ).toBe(
      [
        'colon: "has: colon"',
        'dash: "- dash"',
        'reserved: "true"',
        'numeric: "200"',
        'hash: a#b',
        'text: plain text',
        '',
      ].join('\n'),
    );
  });

  it('quotes keys with special characters (OpenAPI paths / status codes)', () => {
    const out = toYaml({ '/api/users/{id}': { get: {} }, '200': 'OK' });
    expect(out).toContain('"/api/users/{id}":');
    expect(out).toContain('"200": OK');
  });

  it('renders sequences, including arrays of objects', () => {
    expect(
      toYaml({ tags: ['Auth'], params: [{ name: 'id', in: 'path' }] }),
    ).toBe(
      [
        'tags:',
        '  - Auth',
        'params:',
        '  - name: id',
        '    in: path',
        '',
      ].join('\n'),
    );
  });

  it('renders scalars and empty containers', () => {
    expect(toYaml({ n: 42, f: 3.5, t: true, z: null, a: [], o: {} })).toBe(
      ['n: 42', 'f: 3.5', 't: true', 'z: null', 'a: []', 'o: {}', ''].join('\n'),
    );
  });

  it('escapes control characters and quotes inside double-quoted strings', () => {
    expect(toYaml({ s: 'line1\nline2 "q"' })).toBe('s: "line1\\nline2 \\"q\\""\n');
  });
});
