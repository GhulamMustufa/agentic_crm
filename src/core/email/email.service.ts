import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/config.service';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  public lastSentResetUrl: string | null = null;
  public lastSentInviteUrl: string | null = null;

  constructor(private readonly config: AppConfigService) {}

  async sendPasswordResetEmail(to: string, fullName: string, resetUrl: string): Promise<boolean> {
    this.lastSentResetUrl = resetUrl;
    const recipientName = fullName?.trim() || 'there';

    const subject = 'Reset your Agentic OS password';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #1e293b; padding: 24px 32px; border-bottom: 1px solid #334155;">
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">Agentic Business OS</h1>
      <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Autonomous Financial Operating System</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">Reset Your Password</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
        Hello ${recipientName},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
        We received a request to reset the password for your Agentic Business OS account. Click the button below to choose a new password:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
          Reset Password
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 16px 0;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #2563eb; word-break: break-all; font-size: 12px;">${resetUrl}</a>
      </p>
      <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 28px;">
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0 0 8px 0;">
          ⏳ <strong>Security Note:</strong> This password reset link is strictly valid for <strong>60 minutes</strong> and can only be used once.
        </p>
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
          If you did not request this change, you can safely disregard this email. Your password will remain unchanged.
        </p>
      </div>
    </div>
    <div style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">
        &copy; ${new Date().getFullYear()} Agentic Business OS. 100% Deterministic Financial Security.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Hello ${recipientName},

We received a request to reset your password for Agentic Business OS.

Click the link below or copy it into your browser to reset your password:
${resetUrl}

This link is valid for 60 minutes and can only be used once.

If you did not request this password reset, please ignore this email.
    `.trim();

    return this.sendEmail({ to, subject, html, text });
  }

  async sendOrganizationInviteEmail(
    to: string,
    inviterName: string,
    orgName: string,
    roleCode: string,
    inviteUrl: string,
  ): Promise<boolean> {
    this.lastSentInviteUrl = inviteUrl;
    const cleanInviter = inviterName?.trim() || 'A team administrator';
    const cleanOrg = orgName?.trim() || 'an organization';
    const subject = `You've been invited to join ${cleanOrg} on Agentic Business OS`;

    const roleDescriptions: Record<string, string> = {
      OWNER: 'Full administrative & financial authority',
      CONTROLLER: 'Approvals, period close, and journal posting',
      BOOKKEEPER: 'Invoice entry, banking uploads, and draft transactions',
      AUDITOR: 'Read-only financial audit and reporting',
    };
    const roleDesc = roleDescriptions[roleCode] || 'Team collaborator';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #1e293b; padding: 24px 32px; border-bottom: 1px solid #334155;">
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">Agentic Business OS</h1>
      <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Autonomous Financial Operating System</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">Team Invitation</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
        <strong>${cleanInviter}</strong> has invited you to collaborate in <strong>${cleanOrg}</strong> on Agentic Business OS.
      </p>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">Assigned Role</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${roleCode}</div>
        <div style="font-size: 13px; color: #475569; margin-top: 2px;">${roleDesc}</div>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
        Click the button below to accept your invitation and access the organization's financial portal:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" style="background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
          Accept Invitation & Join Team
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 16px 0;">
        Or copy and paste this link into your browser:<br>
        <a href="${inviteUrl}" style="color: #2563eb; word-break: break-all; font-size: 12px;">${inviteUrl}</a>
      </p>
      <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 28px;">
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0 0 8px 0;">
          ⏳ <strong>Invitation Expiry:</strong> This secure invitation link is valid for <strong>7 days</strong>.
        </p>
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
          If you did not expect an invitation to ${cleanOrg}, you can safely disregard this email.
        </p>
      </div>
    </div>
    <div style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">
        &copy; ${new Date().getFullYear()} Agentic Business OS. 100% Deterministic Financial Security.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Hello,

${cleanInviter} has invited you to join ${cleanOrg} on Agentic Business OS as a ${roleCode} (${roleDesc}).

Click the link below or copy it into your browser to accept your invitation:
${inviteUrl}

This invitation link is valid for 7 days.

If you were not expecting this invitation, you can safely ignore this email.
    `.trim();

    return this.sendEmail({ to, subject, html, text });
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    const resendApiKey = this.config.get('RESEND_API_KEY');
    const from = this.config.get('EMAIL_FROM') || 'Agentic OS <onboarding@resend.dev>';

    if (resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          this.logger.error(`Resend API error (${response.status}): ${errorBody}`);
          this.logDevFallback(options);
          return false;
        }

        this.logger.log(`Password reset email successfully sent via Resend to ${options.to}`);
        return true;
      } catch (err: unknown) {
        this.logger.error('Failed to dispatch email via Resend API', err);
        this.logDevFallback(options);
        return false;
      }
    } else {
      this.logDevFallback(options);
      return true;
    }
  }

  private logDevFallback(options: SendEmailOptions): void {
    this.logger.warn(
      `[EmailService:Fallback] RESEND_API_KEY not configured or failed. Email to ${options.to}:\n` +
        `Subject: ${options.subject}\n` +
        `Content snippet: ${options.text.slice(0, 160)}...`,
    );
  }
}
