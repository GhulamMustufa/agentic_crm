import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';

import { extractTextFromPdfBuffer } from './pdf-statement.parser';
import { AiGatewayService, AI_GATEWAY_TOKEN } from '../../../core/ai/ai-gateway.service';
import { ValidationError } from '../../../core/errors/app-error';

import type { IStatementParser, ParsedStatementResult } from './statement-parser.interface';

type AiStatementData = z.infer<typeof AiStatementSchema>;

@Injectable()
export class AiStatementParser implements IStatementParser {
  constructor(@Inject(AI_GATEWAY_TOKEN) private readonly aiGateway: AiGatewayService) {}

  async parse(content: string | Buffer): Promise<ParsedStatementResult> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64');

    let textContent = '';
    if (rawBuffer.toString('binary').includes('%PDF-')) {
      textContent = await extractTextFromPdfBuffer(rawBuffer);
    } else {
      textContent = rawBuffer.toString('utf-8');
    }

    const result = await this.aiGateway.extractStructuredWithFallback<AiStatementData>({
      systemPrompt: `You are an expert forensic accountant. Extract ALL transaction entries, opening balance, and closing balance from this bank statement text.

CRITICAL EXTRACTION RULES:
1. 'openingBalance': Extract the BEGINNING BALANCE / BAKI AWAL / BAKI PEMBUKAAN shown at the top of the statement (page 1).
2. 'closingBalance': Extract the ENDING BALANCE / BAKI AKHIR / BAKI PENUTUP shown at the end of the statement (last page).
3. 'transactions': Extract EVERY transaction line across ALL pages from start to end without omitting any line.
4. Date parsing: If entry dates are in 'DD/MM' or 'DD/MM/YY' format (e.g. '01/06'), combine with the statement year (e.g. '2026') to output 'YYYY-MM-DD' (e.g. '2026-06-01').
5. Amount signs:
   - Suffix '-' or 'DR' (e.g. 1,500.00- or 1500.00DR) means DEBIT (withdrawal/outflow). Represent as a negative number (e.g. -1500.00).
   - Suffix '+' or 'CR' or plain numbers (e.g. 1,500.00+ or 1500.00) means CREDIT (deposit/inflow). Represent as a positive number (e.g. 1500.00).
6. Multi-line narratives: Combine sub-lines and reference IDs into a single clean 'description' string for each transaction.
7. Ensure Opening Balance + sum(transactions.amount) == Closing Balance.

You must return ONLY a JSON object matching this schema:
{
  "bankName": "string (optional)",
  "accountType": "CHECKING | SAVINGS | CREDIT_CARD (optional)",
  "accountNumberLast4": "string (optional)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "openingBalance": number,
  "closingBalance": number,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": number
    }
  ]
}`,
      documentTextOrImageBase64: textContent,
      schema: AiStatementSchema,
    });

    const data = result.data;

    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;

    // Use cents for exact math
    const openingBalanceCents = BigInt(Math.round(data.openingBalance * 100));
    const closingBalanceCents = BigInt(Math.round(data.closingBalance * 100));
    let calculatedBalanceCents = openingBalanceCents;

    const parsedTransactions = data.transactions.map(
      (tx: { date: string; description: string; amount: number }) => {
        const amountCents = BigInt(Math.round(tx.amount * 100));

        if (amountCents < 0n) {
          // Debit
          // Math.abs on BigInt can be done by negating it
          totalDebitsCents += -amountCents;
        } else {
          // Credit
          totalCreditsCents += amountCents;
        }
        calculatedBalanceCents += amountCents;

        return {
          date: tx.date,
          description: tx.description,
          amountCents,
        };
      },
    );

    if (calculatedBalanceCents !== closingBalanceCents) {
      throw new ValidationError(
        `AI Mathematical validation failed: Opening Balance (${openingBalanceCents}) + Net (${totalCreditsCents - totalDebitsCents}) != Closing Balance (${closingBalanceCents})`,
      );
    }

    return {
      startDate: data.startDate,
      endDate: data.endDate,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions: parsedTransactions,
      bankName: data.bankName,
      accountType: data.accountType,
      accountNumberLast4: data.accountNumberLast4,
    };
  }
}
