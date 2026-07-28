import { Injectable, Logger } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { MailContent } from "./mail-templates.js";

/**
 * Outbound email (product-roadmap A2). Self-host friendly: SMTP is **optional** (roadmap principle
 * #3) — with no `SMTP_HOST` the service runs in **log mode**, writing the message (including the
 * action link) to the Nest logger so a minimal install, a dev box without MailHog/Mailpit, and the
 * test suite all still exercise the full flow. Sending never throws: a broken SMTP server must not
 * fail a registration or a password-reset request, so failures are logged and swallowed.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  async send(to: string, content: MailContent): Promise<void> {
    const transporter = this.resolveTransporter();
    if (!transporter) {
      this.logger.log(`[mail:log-mode] to=${to} subject="${content.subject}"\n${content.text}`);
      return;
    }
    try {
      await transporter.sendMail({
        from: this.config.get<string>("MAIL_FROM"),
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch (err) {
      this.logger.error(`Failed to send "${content.subject}" to ${to}: ${(err as Error).message}`);
    }
  }

  /** Build the transport once, on first use; `null` = log mode (no SMTP host configured). */
  private resolveTransporter(): Transporter | null {
    if (this.transporter !== undefined) return this.transporter;
    const host = this.config.get<string>("SMTP_HOST");
    if (!host) {
      this.transporter = null;
      return null;
    }
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASSWORD");
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>("SMTP_PORT", 1025),
      secure: this.config.get<boolean>("SMTP_SECURE", false),
      // MailHog/Mailpit accept anonymous mail; only pass credentials when both are configured.
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.transporter;
  }
}
