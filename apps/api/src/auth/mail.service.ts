import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { renderEmailHtml } from './email-template';

/**
 * How outbound mail is delivered. Resolved once on boot (mirrors the
 * `LLM_PROVIDER` / `BILLING_PROVIDER` pattern):
 *
 *  - `resend`  — Resend HTTP API (recommended for prod; works where SMTP ports
 *                are blocked, e.g. most PaaS hosts). Native `fetch`, no SDK.
 *  - `smtp`    — any SMTP relay via nodemailer.
 *  - `preview` — Ethereal throwaway inbox; actually sends + logs a preview URL.
 *                Zero-setup local dev only — NOT real delivery.
 *  - `log`     — just log the link/code (offline / tests).
 */
export type MailProvider = 'resend' | 'smtp' | 'preview' | 'log';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Outbound email (Slice 9b). Set `MAIL_PROVIDER` to force one, otherwise it
 * auto-resolves in priority order: Resend (`RESEND_API_KEY`) → SMTP
 * (`SMTP_HOST`) → Ethereal preview (`MAIL_PREVIEW=true`) → console log. The
 * resolved provider is logged on boot, and running `preview`/`log` under
 * `NODE_ENV=production` logs a loud warning (those don't deliver real mail).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: MailProvider;
  private readonly from: string;
  private readonly resendApiKey: string | undefined;
  private readonly smtpTransporter: Transporter | null;
  /** Lazily-created Ethereal transport (cached across sends). */
  private previewTransporter: Promise<Transporter> | null = null;

  constructor(private readonly config: ConfigService) {
    // Prefer MAIL_FROM (provider-agnostic); fall back to the legacy SMTP_FROM.
    this.from =
      config.get<string>('MAIL_FROM') ??
      config.get<string>('SMTP_FROM', 'no-reply@archivato.local');
    this.resendApiKey = config.get<string>('RESEND_API_KEY') || undefined;

    const host = config.get<string>('SMTP_HOST');
    this.smtpTransporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get<number>('SMTP_PORT', 587),
          secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
          auth: configuredAuth(config),
        })
      : null;

    this.provider = this.resolveProvider();
    this.logger.log(`Mail provider: ${this.provider}`);
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      (this.provider === 'preview' || this.provider === 'log')
    ) {
      this.logger.warn(
        `Mail provider is "${this.provider}" in production — verification and ` +
          `password-reset emails will NOT be delivered. Set RESEND_API_KEY ` +
          `(recommended) or SMTP_HOST.`,
      );
    }
  }

  /** True when a real delivery transport (Resend or SMTP) is configured. */
  get isConfigured(): boolean {
    return this.provider === 'resend' || this.provider === 'smtp';
  }

  /** Which transport is active (for tests / diagnostics). */
  get activeProvider(): MailProvider {
    return this.provider;
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    const subject = 'Verify your Archivato email';
    const text = `Welcome to Archivato!\n\nConfirm your email by opening this link:\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.`;
    const html = renderEmailHtml({
      previewText: 'Confirm your email to start using Archivato.',
      heading: 'Verify your email',
      paragraphs: [
        'Welcome to Archivato — let’s confirm this is you.',
        'Click the button below to verify your email address and activate your account.',
      ],
      button: { label: 'Verify my email', url: verifyUrl },
      footnote:
        'This link expires in 24 hours. If you didn’t create an Archivato account, you can safely ignore this email.',
    });

    await this.send({ to, subject, text, html }, verifyUrl);
  }

  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const subject = 'Your Archivato password reset code';
    const text = `Your Archivato password reset code is ${code}.\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`;
    const html = renderEmailHtml({
      previewText: 'Your Archivato password reset code.',
      heading: 'Reset your password',
      paragraphs: ['Use the code below to reset your Archivato password:'],
      code,
      footnote:
        'This code expires in 10 minutes. If you didn’t request a password reset, you can safely ignore this email.',
    });

    // Pass the code as the "link" so the dev/console fallback still shows it.
    await this.send({ to, subject, text, html }, `reset code: ${code}`);
  }

  /**
   * Generic transactional email used by the Support Center notifications: a
   * plain templated body plus an optional absolute link to open the ticket.
   * The body may contain user-controlled text (a ticket subject), so it's
   * HTML-escaped before it goes into the HTML part. Callers wrap this
   * best-effort — a mail failure must never break the underlying action.
   */
  async sendNotificationEmail(
    to: string,
    subject: string,
    body: string,
    link?: string,
  ): Promise<void> {
    const text = link ? `${body}\n\nOpen it here: ${link}` : body;
    const html = renderEmailHtml({
      previewText: subject,
      heading: subject,
      paragraphs: [body],
      button: link ? { label: 'Open in Archivato', url: link } : undefined,
    });
    await this.send({ to, subject, text, html }, link ?? subject);
  }

  private async send(
    message: { to: string; subject: string; text: string; html: string },
    link: string,
  ): Promise<void> {
    switch (this.provider) {
      case 'resend':
        await this.sendViaResend(message);
        this.logger.log(`Email sent to ${message.to} via Resend`);
        return;

      case 'smtp':
        await this.smtpTransporter!.sendMail({ from: this.from, ...message });
        this.logger.log(`Email sent to ${message.to} via SMTP`);
        return;

      case 'preview':
        await this.sendViaPreview(message, link);
        return;

      case 'log':
      default:
        this.logger.warn(
          `No mail transport configured. Link for ${message.to}: ${link}`,
        );
        return;
    }
  }

  /** POST the message to the Resend HTTP API. Throws on a non-2xx response. */
  private async sendViaResend(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!res.ok) {
      // Body may carry a Resend error detail; keep it out of the thrown message
      // to avoid leaking recipient/config specifics upstream.
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Resend API responded ${res.status}${detail ? `: ${detail}` : ''}`,
      );
      throw new Error(`Resend delivery failed (HTTP ${res.status})`);
    }
  }

  /** Ethereal preview inbox — actually sends, then logs a preview URL. */
  private async sendViaPreview(
    message: { to: string; subject: string; text: string; html: string },
    link: string,
  ): Promise<void> {
    try {
      const transporter = await this.getPreviewTransporter();
      const info = await transporter.sendMail({ from: this.from, ...message });
      const url = nodemailer.getTestMessageUrl(info);
      this.logger.log(
        `Preview email sent to ${message.to}. Open it here: ${url}`,
      );
    } catch (err) {
      // Preview is a dev convenience; never fail the flow — log the link instead.
      this.logger.error(
        `Ethereal preview failed (${(err as Error).message}); ` +
          `link for ${message.to}: ${link}`,
      );
    }
  }

  private getPreviewTransporter(): Promise<Transporter> {
    if (!this.previewTransporter) {
      this.previewTransporter = nodemailer
        .createTestAccount()
        .then((account) =>
          nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: { user: account.user, pass: account.pass },
          }),
        );
    }
    return this.previewTransporter;
  }

  /**
   * Resolve the delivery strategy. An explicit `MAIL_PROVIDER` wins (validated);
   * otherwise auto-detect from configured credentials.
   */
  private resolveProvider(): MailProvider {
    const forced = this.config.get<string>('MAIL_PROVIDER')?.trim();
    if (forced) {
      if (isMailProvider(forced)) return forced;
      this.logger.warn(
        `Unknown MAIL_PROVIDER "${forced}"; falling back to auto-detection.`,
      );
    }

    if (this.resendApiKey) return 'resend';
    if (this.smtpTransporter) return 'smtp';
    if (this.config.get<string>('MAIL_PREVIEW', '') === 'true') return 'preview';
    return 'log';
  }
}

function isMailProvider(value: string): value is MailProvider {
  return (
    value === 'resend' ||
    value === 'smtp' ||
    value === 'preview' ||
    value === 'log'
  );
}

/** Only pass auth when a username is configured (some relays are open/local). */
function configuredAuth(
  config: ConfigService,
): { user: string; pass: string } | undefined {
  const user = config.get<string>('SMTP_USER');
  const pass = config.get<string>('SMTP_PASS');
  return user && pass ? { user, pass } : undefined;
}
