import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outbound email (Slice 9b). Delivery strategy, in priority order:
 *
 *  1. Real SMTP — when `SMTP_HOST` is set (nodemailer).
 *  2. Ethereal preview — when `MAIL_PREVIEW=true` and no SMTP is configured:
 *     nodemailer creates a throwaway test inbox and the message is actually
 *     sent; we log a clickable preview URL. Great for local dev with zero setup.
 *  3. Console log — otherwise just log the link (offline / tests).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly smtpTransporter: Transporter | null;
  private readonly previewEnabled: boolean;
  private readonly from: string;
  /** Lazily-created Ethereal transport (cached across sends). */
  private previewTransporter: Promise<Transporter> | null = null;

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM', 'no-reply@archivato.local');
    this.previewEnabled = config.get<string>('MAIL_PREVIEW', '') === 'true';

    const host = config.get<string>('SMTP_HOST');
    this.smtpTransporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get<number>('SMTP_PORT', 587),
          secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
          auth: configuredAuth(config),
        })
      : null;
  }

  /** True when a real SMTP transport is configured. */
  get isConfigured(): boolean {
    return this.smtpTransporter !== null;
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    const subject = 'Verify your Archivato email';
    const text = `Welcome to Archivato!\n\nConfirm your email by opening this link:\n${verifyUrl}\n\nThis link expires in 24 hours.`;
    const html =
      `<p>Welcome to Archivato!</p>` +
      `<p>Confirm your email by clicking the link below:</p>` +
      `<p><a href="${verifyUrl}">Verify my email</a></p>` +
      `<p>This link expires in 24 hours.</p>`;

    await this.send({ to, subject, text, html }, verifyUrl);
  }

  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const subject = 'Your Archivato password reset code';
    const text = `Your password reset code is ${code}.\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`;
    const html =
      `<p>Your Archivato password reset code is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>` +
      `<p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`;

    // Pass the code as the "link" so the dev/console fallback still shows it.
    await this.send({ to, subject, text, html }, `reset code: ${code}`);
  }

  private async send(
    message: { to: string; subject: string; text: string; html: string },
    link: string,
  ): Promise<void> {
    // 1) Real SMTP.
    if (this.smtpTransporter) {
      await this.smtpTransporter.sendMail({ from: this.from, ...message });
      this.logger.log(`Email sent to ${message.to} via SMTP`);
      return;
    }

    // 2) Ethereal preview inbox (actually sends; logs a preview URL).
    if (this.previewEnabled) {
      try {
        const transporter = await this.getPreviewTransporter();
        const info = await transporter.sendMail({ from: this.from, ...message });
        const url = nodemailer.getTestMessageUrl(info);
        this.logger.log(
          `Preview email sent to ${message.to}. Open it here: ${url}`,
        );
        return;
      } catch (err) {
        this.logger.error(
          `Ethereal preview failed (${(err as Error).message}); ` +
            `falling back to logging the link.`,
        );
      }
    }

    // 3) Console fallback.
    this.logger.warn(
      `No mail transport configured. Link for ${message.to}: ${link}`,
    );
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
}

/** Only pass auth when a username is configured (some relays are open/local). */
function configuredAuth(
  config: ConfigService,
): { user: string; pass: string } | undefined {
  const user = config.get<string>('SMTP_USER');
  const pass = config.get<string>('SMTP_PASS');
  return user && pass ? { user, pass } : undefined;
}
