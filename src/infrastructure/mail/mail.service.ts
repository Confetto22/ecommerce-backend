import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

export type SendMailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Base URL for API routes embedded in emails (must reach Nest, e.g. `http://localhost:8080/api`). */
  private readonly verificationBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    sgMail.setApiKey(this.configService.getOrThrow<string>('SENDGRID_API_KEY'));
    this.verificationBaseUrl =
      this.configService.get<string>('VERIFICATION_BASE_URL') ??
      this.configService.getOrThrow<string>('APP_URL');
  }

  /**
   * Sends mail via SendGrid. `SENDGRID_FROM_EMAIL` must be a verified sender.
   */
  async send(input: SendMailInput): Promise<void> {
    const from = this.configService.getOrThrow<string>('SENDGRID_FROM_EMAIL');

    try {
      await sgMail.send({
        to: input.to,
        from,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      this.logger.log(`Email sent to ${input.to}`);
    } catch (err) {
      this.logger.error('SendGrid send failed', err);
      throw err;
    }
  }

  /**
   * Post–email-verification welcome (plain + HTML).
   */
  async sendWelcomeEmail(to: string, displayName: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to Mediva',
      text: `Hi ${displayName},

Your email is verified. You can now sign in and use Mediva.

Thanks,
Mediva`,
      html: `
        <p>Hi ${displayName},</p>
        <p>Your email is verified. You can now sign in and use Mediva.</p>
        <p>Thanks,<br/>Mediva</p>
      `,
    });
  }

  /**
   * Send email verification email. Prefer `VERIFICATION_BASE_URL` (Nest API
   * origin + `/api` if used) so the link is not mistaken for the SPA origin.
   * Link uses `?token=` so long hex values are not split across path segments.
   */
  async sendVerificationEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    const base = this.verificationBaseUrl.replace(/\/$/, '');
    const verificationUrl = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;

    const mailOptions = {
      to,
      subject: 'Verify your email',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your email</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #022c3b 0%, #0399cb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Jandas Touch</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Welcome, ${fullName}!</h2>
            <p>Thank you for signing up for Jandas Touch. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: #de7b09; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="color: #0399cb; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">This link will expire in 24 hours.</p>
            <p style="color: #666; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Jandas Touch. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to Jandas Touch, ${fullName}!
        
        Please verify your email address by clicking the following link:
        ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create an account, please ignore this email.
      `,
    };

    try {
      await this.send(mailOptions);
      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}:`, error);
      // Don't throw - email failures shouldn't block user operations
    }
  }
}
