import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM'),
        to,
        subject,
        html,
      });
    } catch (err) {
      // Never let a mail failure break the request flow (e.g. registration should still succeed)
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }

  async sendEmailVerification(to: string, name: string, token: string) {
    const link = `${this.config.get<string>('FRONTEND_URL')}/verify-email?token=${token}`;
    await this.send(
      to,
      'Verify your email - School Exam System',
      `<p>Hi ${name},</p>
       <p>Please verify your email address to continue registration.</p>
       <p><a href="${link}">Verify Email</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  }

  async sendTeacherPendingApprovalNotice(to: string, name: string) {
    await this.send(
      to,
      'Registration received - awaiting admin approval',
      `<p>Hi ${name},</p>
       <p>Your email has been verified. Your account is now pending approval by your school administrator.
       You'll receive another email once you're approved.</p>`,
    );
  }

  async sendTeacherApprovedNotice(to: string, name: string) {
    await this.send(
      to,
      'Your account has been approved',
      `<p>Hi ${name},</p>
       <p>Your school administrator has approved your account. You can now log in.</p>`,
    );
  }

  async sendPasswordReset(to: string, name: string, token: string) {
    const link = `${this.config.get<string>('FRONTEND_URL')}/reset-password?token=${token}`;
    await this.send(
      to,
      'Reset your password',
      `<p>Hi ${name},</p>
       <p>Click the link below to reset your password. This link expires in 1 hour.</p>
       <p><a href="${link}">Reset Password</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`,
    );
  }
}
