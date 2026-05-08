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

  constructor(private readonly configService: ConfigService) {
    sgMail.setApiKey(this.configService.getOrThrow<string>('SENDGRID_API_KEY'));
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
  async sendVerificationCode(
    to: string,
    fullName: string,
    code: string,
  ): Promise<void> {
    const mailOptions = {
      to,
      subject: 'Your Mediva Verification Code',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #022c3b 0%, #0399cb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Mediva</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Welcome, ${fullName}!</h2>
          <p>Thank you for signing up. Use the code below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #fff; border: 2px dashed #0399cb; border-radius: 8px; padding: 20px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #022c3b;">${code}</span>
            </div>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in <strong>1 hour</strong>.</p>
          <p style="color: #666; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Mediva. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
      text: `Welcome to Mediva, ${fullName}!\n\nYour verification code is: ${code}\n\nThis code will expire in 1 hour.\n\nIf you didn't create an account, please ignore this email.`,
    };

    try {
      await this.send(mailOptions);
      this.logger.log(`Verification code email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification code to ${to}:`, error);
    }
  }
}
