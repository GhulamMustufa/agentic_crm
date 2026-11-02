import { Injectable, Inject, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AiGatewayService, AI_GATEWAY_TOKEN } from '../../../core/ai/ai-gateway.service';
import { ValidationError } from '../../../core/errors/app-error';
import {
  contentToImageBuffer,
  validateImageBuffer,
  imageBufferToDataUri,
} from '../utils/image-validator';

import type {
  IStatementParser,
  ParsedStatementResult,
  ParsedTransactionLine,
  ParseStatementOptions,
} from './statement-parser.interface';

export const ImageStatementTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(), // Negative for debit/withdrawal, positive for credit/deposit
});

export const ImageStatementExtractionSchema = z.object({
  isRecognizedBankStatement: z.boolean(),
  unrecognizedReason: z.string().nullable().optional(),
  isBlurryOrUnreadable: z.boolean(),
  bankName: z.string().nullable().optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']).nullable().optional(),
  accountNumberLast4: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  openingBalance: z.number().nullable().optional(),
  closingBalance: z.number().nullable().optional(),
  transactions: z.array(ImageStatementTransactionSchema),
});

export type ImageStatementExtractionData = z.infer<typeof ImageStatementExtractionSchema>;

@Injectable()
export class ImageStatementParser implements IStatementParser {
  private readonly logger = new Logger(ImageStatementParser.name);

  constructor(@Inject(AI_GATEWAY_TOKEN) private readonly aiGateway: AiGatewayService) {}

  async parse(
    content: string | Buffer,
    options?: ParseStatementOptions,
  ): Promise<ParsedStatementResult> {
    // 1. Validate magic bytes and format
    const rawBuffer = contentToImageBuffer(content);
    const mimeType = validateImageBuffer(rawBuffer);
    const dataUri = imageBufferToDataUri(rawBuffer, mimeType);

    this.logger.log(
      `Parsing bank statement image (${mimeType}, ${(rawBuffer.length / 1024).toFixed(1)} KB)...`,
    );

    // 2. Multimodal AI Vision Extraction with Forensic Prompt
    const result = await this.aiGateway.extractStructuredWithFallback<ImageStatementExtractionData>(
      {
        systemPrompt: `You are an expert forensic accountant and document analysis vision AI.
Analyze this photo, scan, or screenshot of a bank statement document.

CRITICAL INSTRUCTIONS:
1. 'isRecognizedBankStatement': Determine whether this document is an authentic bank account statement, online banking screenshot, or official bank transaction record.
   - If this is NOT a bank statement (e.g. a dining receipt, invoice, personal photo, selfie, pet picture, meme, or random paperwork), set "isRecognizedBankStatement": false and provide an explanatory "unrecognizedReason".
2. 'isBlurryOrUnreadable': Set to true if the numbers or text are too blurred, pixelated, or illegible to transcribe with 100% mathematical certainty.
3. 'bankName': Name of the financial institution (e.g. Chase, Mercury, Maybank, CIMB, Barclays).
4. 'accountType': 'CHECKING', 'SAVINGS', or 'CREDIT_CARD'.
5. 'accountNumberLast4': Last 4 digits of the bank account number if visible.
6. 'startDate' and 'endDate': ISO dates (YYYY-MM-DD) for the statement period.
7. 'openingBalance': Beginning / opening cash balance.
8. 'closingBalance': Ending / closing cash balance.
9. 'transactions': Extract EVERY individual transaction row:
   - 'date': YYYY-MM-DD
   - 'description': Clean narrative, payee, or description
   - 'amount': Signed decimal number. Withdrawals/debits MUST be negative (e.g. -150.00). Deposits/credits MUST be positive (e.g. 2500.00).

Return ONLY valid JSON matching the schema.`,
        documentTextOrImageBase64: dataUri,
        schema: ImageStatementExtractionSchema,
      },
    );

    const data = result.data;

    // 3. Document Validity Sanity Gate
    if (!data.isRecognizedBankStatement) {
      throw new ValidationError(
        data.unrecognizedReason ||
          'Uploaded image is not an authentic bank account statement or document is unrecognizable',
      );
    }

    // 4. Fixed-point cents conversion for double-entry arithmetic
    const openingBalance = data.openingBalance ?? 0;
    const closingBalance = data.closingBalance ?? 0;
    const openingBalanceCents = BigInt(Math.round(openingBalance * 100));
    const closingBalanceCents = BigInt(Math.round(closingBalance * 100));

    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;

    const parsedTransactions: ParsedTransactionLine[] = (data.transactions || []).map((tx, idx) => {
      const amountCents = BigInt(Math.round(tx.amount * 100));
      if (amountCents < 0n) {
        totalDebitsCents += -amountCents;
      } else {
        totalCreditsCents += amountCents;
      }

      return {
        date: tx.date,
        amountCents,
        description: tx.description,
        sourceRowIndex: idx + 1,
        direction: amountCents < 0n ? 'DEBIT' : 'CREDIT',
        signedAmountCents: amountCents,
        extractionMethod: 'AI_VISION',
        extractionConfidence: result.confidence,
      };
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      startDate: data.startDate || todayStr,
      endDate: data.endDate || todayStr,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions: parsedTransactions,
      bankName: data.bankName || options?.bankInstitution,
      accountType: data.accountType || undefined,
      accountNumberLast4: data.accountNumberLast4 || undefined,
      pageCount: 1,
      extractionMode: 'AI_VISION',
      formatDetected: 'IMAGE_BANK_STATEMENT',
      parserVersion: '1.0.0-vision',
      metadata: {
        isBlurryOrUnreadable: data.isBlurryOrUnreadable,
        mimeType,
        providerUsed: result.providerUsed,
        confidence: result.confidence,
        durationMs: result.durationMs,
      },
    };
  }
}
