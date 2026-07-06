import { ConfigService } from '@nestjs/config';
import { MailService, type MailProvider } from './mail.service';

/** A ConfigService stub backed by a plain map (with `get(key, default)`). */
function fakeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, def?: unknown) =>
      key in values ? values[key] : def,
  } as unknown as ConfigService;
}

function makeService(values: Record<string, string>): MailService {
  return new MailService(fakeConfig(values));
}

describe('MailService provider resolution', () => {
  it('defaults to `log` when nothing is configured', () => {
    expect(makeService({}).activeProvider).toBe('log');
    expect(makeService({}).isConfigured).toBe(false);
  });

  it('uses Ethereal `preview` when MAIL_PREVIEW=true and no real transport', () => {
    expect(makeService({ MAIL_PREVIEW: 'true' }).activeProvider).toBe(
      'preview',
    );
  });

  it('prefers SMTP over preview when SMTP_HOST is set', () => {
    const svc = makeService({ SMTP_HOST: 'smtp.example.com', MAIL_PREVIEW: 'true' });
    expect(svc.activeProvider).toBe('smtp');
    expect(svc.isConfigured).toBe(true);
  });

  it('prefers Resend over everything when RESEND_API_KEY is set', () => {
    const svc = makeService({
      RESEND_API_KEY: 're_test',
      SMTP_HOST: 'smtp.example.com',
      MAIL_PREVIEW: 'true',
    });
    expect(svc.activeProvider).toBe('resend');
    expect(svc.isConfigured).toBe(true);
  });

  it('honors an explicit MAIL_PROVIDER over auto-detection', () => {
    const svc = makeService({
      MAIL_PROVIDER: 'log',
      RESEND_API_KEY: 're_test',
    });
    expect(svc.activeProvider).toBe('log');
  });

  it('ignores an unknown MAIL_PROVIDER and falls back to auto-detection', () => {
    const svc = makeService({
      MAIL_PROVIDER: 'sendgrid' as MailProvider,
      RESEND_API_KEY: 're_test',
    });
    expect(svc.activeProvider).toBe('resend');
  });
});

describe('MailService Resend delivery', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POSTs to the Resend API with auth + payload', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const svc = makeService({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'no-reply@archivato.test',
    });
    await svc.sendPasswordResetOtp('user@example.com', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('no-reply@archivato.test');
    expect(body.to).toBe('user@example.com');
    expect(body.text).toContain('123456');
  });

  it('throws when the Resend API returns a non-2xx status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'domain not verified',
    }) as unknown as typeof fetch;

    const svc = makeService({ RESEND_API_KEY: 're_test' });
    await expect(
      svc.sendVerificationEmail('user@example.com', 'https://x/verify'),
    ).rejects.toThrow('Resend delivery failed (HTTP 422)');
  });
});
