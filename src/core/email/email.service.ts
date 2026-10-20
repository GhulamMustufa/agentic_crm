import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/config.service';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface InvoiceEmailLineItem {
  description: string;
  quantity: number;
  unitPriceCents: bigint | number;
  totalCents: bigint | number;
}

export interface SendInvoiceEmailParams {
  to: string;
  customerName: string;
  orgName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotalCents: bigint | number;
  taxCents: bigint | number;
  totalAmountCents: bigint | number;
  lineItems: InvoiceEmailLineItem[];
  paymentInstructions?: string | null;
}

function formatCurrencyAmount(cents: bigint | number, currency = 'USD'): string {
  const num = typeof cents === 'bigint' ? Number(cents) / 100 : Number(cents) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  public lastSentResetUrl: string | null = null;
  public lastSentInviteUrl: string | null = null;
  public lastSentInvoiceParams: SendInvoiceEmailParams | null = null;

  constructor(private readonly config: AppConfigService) {}

  async sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<boolean> {
    this.lastSentInvoiceParams = params;
    const cleanCustomer = params.customerName?.trim() || 'Valued Customer';
    const cleanOrg = params.orgName?.trim() || 'Our Company';
    const subject = `Invoice ${params.invoiceNumber} from ${cleanOrg}`;

    const itemsRowsHtml = params.lineItems
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 4px; color: #1e293b;">${item.description}</td>
          <td style="padding: 10px 4px; text-align: center; color: #64748b;">${item.quantity}</td>
          <td style="padding: 10px 4px; text-align: right; color: #64748b; font-family: monospace;">${formatCurrencyAmount(item.unitPriceCents, params.currency)}</td>
          <td style="padding: 10px 4px; text-align: right; font-weight: 600; color: #0f172a; font-family: monospace;">${formatCurrencyAmount(item.totalCents, params.currency)}</td>
        </tr>`,
      )
      .join('');

    const taxAmountCents = BigInt(params.taxCents || 0);
    const taxRowHtml =
      taxAmountCents > 0n
        ? `
        <tr>
          <td colspan="3" style="padding: 6px 4px; text-align: right; color: #64748b;">Sales Tax:</td>
          <td style="padding: 6px 4px; text-align: right; font-weight: 500; color: #1e293b; font-family: monospace;">${formatCurrencyAmount(params.taxCents, params.currency)}</td>
        </tr>`
        : '';

    const paymentInstructionsHtml = params.paymentInstructions
      ? `
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px 18px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">Payment Instructions</div>
        <div style="font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${params.paymentInstructions}</div>
      </div>`
      : '';

    const formattedTotal = formatCurrencyAmount(params.totalAmountCents, params.currency);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 1px solid #1e293b;">
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">${cleanOrg}</h1>
      <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Agentic Business OS &bull; Commercial Invoice</p>
    </div>
    <div style="padding: 32px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">INVOICE</h2>
          <p style="font-size: 14px; color: #64748b; margin: 4px 0 0 0; font-family: monospace;">#${params.invoiceNumber}</p>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Billed To:</td>
            <td style="font-weight: 600; color: #0f172a; text-align: right; padding: 4px 0;">${cleanCustomer}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Issue Date:</td>
            <td style="font-weight: 500; color: #1e293b; text-align: right; padding: 4px 0;">${params.issueDate}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Payment Due Date:</td>
            <td style="font-weight: 700; color: #dc2626; text-align: right; padding: 4px 0;">${params.dueDate}</td>
          </tr>
        </table>
      </div>

      <h3 style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px 0;">Line Items</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 1px solid #cbd5e1; text-align: left;">
            <th style="padding: 8px 4px; font-weight: 600; color: #475569;">Description</th>
            <th style="padding: 8px 4px; font-weight: 600; color: #475569; text-align: center;">Qty</th>
            <th style="padding: 8px 4px; font-weight: 600; color: #475569; text-align: right;">Unit Price</th>
            <th style="padding: 8px 4px; font-weight: 600; color: #475569; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
        <tfoot>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td colspan="3" style="padding: 8px 4px; text-align: right; color: #64748b;">Subtotal:</td>
            <td style="padding: 8px 4px; text-align: right; font-weight: 500; color: #1e293b; font-family: monospace;">${formatCurrencyAmount(params.subtotalCents, params.currency)}</td>
          </tr>
          ${taxRowHtml}
          <tr style="border-top: 2px solid #0f172a;">
            <td colspan="3" style="padding: 12px 4px; text-align: right; font-weight: 700; font-size: 14px; color: #0f172a;">Total Due:</td>
            <td style="padding: 12px 4px; text-align: right; font-weight: 700; font-size: 15px; color: #0f172a; font-family: monospace;">${formattedTotal}</td>
          </tr>
        </tfoot>
      </table>

      ${paymentInstructionsHtml}

      <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 28px;">
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0 0 6px 0;">
          🔒 <strong>Audit Invariant:</strong> This commercial invoice is cryptographically recorded in the general ledger of ${cleanOrg}.
        </p>
        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
          If you have already remitted payment, please disregard this notice.
        </p>
      </div>
    </div>
    <div style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">
        &copy; ${new Date().getFullYear()} ${cleanOrg} &bull; Powered by Agentic Business OS
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const itemsText = params.lineItems
      .map(
        (item) =>
          ` - ${item.description} (x${item.quantity}) : ${formatCurrencyAmount(item.totalCents, params.currency)}`,
      )
      .join('\n');

    const text = `
Invoice #${params.invoiceNumber} from ${cleanOrg}
Billed To: ${cleanCustomer}
Issue Date: ${params.issueDate}
Due Date: ${params.dueDate}

Items:
${itemsText}

Subtotal: ${formatCurrencyAmount(params.subtotalCents, params.currency)}
${taxAmountCents > 0n ? `Sales Tax: ${formatCurrencyAmount(params.taxCents, params.currency)}\n` : ''}Total Due: ${formattedTotal}

${params.paymentInstructions ? `Payment Instructions:\n${params.paymentInstructions}\n\n` : ''}Thank you for your business.
    `.trim();

    return this.sendEmail({ to: params.to, subject, html, text });
  }

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
