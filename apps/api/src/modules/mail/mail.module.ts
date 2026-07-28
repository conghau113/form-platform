import { Module } from "@nestjs/common";
import { MailService } from "./mail.service.js";

/**
 * Mail module (product-roadmap A2). Exports {@link MailService} for feature modules that send
 * transactional email (currently `AuthModule`: verify-email, password-reset, password-changed).
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
