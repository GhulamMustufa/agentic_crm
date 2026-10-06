import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { AiGatewayService, AI_GATEWAY_TOKEN } from '../../../core/ai/ai-gateway.service';
import { IStatementParser, ParsedStatementResult } from './statement-parser.interface';
import { ValidationError } from '../../../core/errors/app-error';
import { parseMonetaryCents, normalizeDate } from './csv-statement.parser';
import pdfParse from 'pdf-parse';

const AiStatementSchema = z.object({
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amount: z.number(),
    })
  ).default([]),
});

@Injectable()
export class AiStatementParser implements IStatementParser {
  constructor(
    @Inject(AI_GATEWAY_TOKEN)
    private readonly aiGateway: AiGatewayService,
  ) {}

  async parse(content: string | Buffer): Promise<ParsedStatementResult> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64');

    let textContent = '';
    
    // Check if it's a PDF or text
    if (rawBuffer.toString('binary', 0, 5) === '%PDF-') {
      const parsedPdf = await pdfParse(rawBuffer);
      textContent = parsedPdf.text;
    } else {
      textContent = rawBuffer.toString('utf-8');
    }

    const provider = this.aiGateway.getProvider();
    
    const systemPrompt = `
You are an expert forensic accountant and data extraction engine.
You will be provided with a chunk of raw extracted text from a bank statement (which may be messy, contain multiple languages, or have multi-line descriptions).
Your task is to extract the following information perfectly and return it in a structured JSON format.

RULES:
1. Extract the bank name and account number if visible.
2. Extract the Opening Balance and Closing Balance if visible (convert to plain numbers without commas).
3. Extract ALL transactions found in this text chunk.
4. For each transaction:
   - "date": MUST be in YYYY-MM-DD format. If the year is missing on the transaction row, infer it from the statement date.
   - "description": Combine multi-line descriptions into a single string. Translate to English if possible, or preserve the original.
   - "amount": MUST be a number. Debits (money out) MUST be negative. Credits (money in) MUST be positive. Handle trailing minus signs (e.g., "1,500.00-" becomes -1500).
5. Output MUST be valid JSON.
`;

    try {
      // 1. CHUNKING STRATEGY
      // Split text into lines to avoid cutting a transaction in half
      const MAX_CHUNK_LENGTH = 15000; // Approx 4,000 tokens / 3-5 pages per chunk
      const lines = textContent.split('\\n');
      const chunks: string[] = [];
      let currentChunk = '';

      for (const line of lines) {
        if (currentChunk.length + line.length > MAX_CHUNK_LENGTH && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        currentChunk += line + '\\n';
      }
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
      }

      console.log(`[AiStatementParser] Document split into ${chunks.length} chunks. Processing...`);

      // 2. PARALLEL BATCH PROCESSING
      const BATCH_SIZE = 5; // Process 5 chunks concurrently to avoid rate limits
      const allExtractedTransactions: any[] = [];
      let globalOpeningBalance: number | undefined = undefined;
      let globalClosingBalance: number | undefined = undefined;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE);
        
        const promises = batchChunks.map((chunkText) =>
          provider.extractStructured({
            systemPrompt,
            documentTextOrImageBase64: chunkText,
            schema: AiStatementSchema,
          })
        );

        const results = await Promise.all(promises);

        // 3. AGGREGATION
        for (const res of results) {
          const data = res.data;
          
          if (data.transactions && data.transactions.length > 0) {
            allExtractedTransactions.push(...data.transactions);
          }
          
          // First chunk usually has opening balance
          if (data.openingBalance !== undefined && globalOpeningBalance === undefined) {
            globalOpeningBalance = data.openingBalance;
          }
          // Last chunk usually has final closing balance
          if (data.closingBalance !== undefined) {
            globalClosingBalance = data.closingBalance;
          }
        }
      }

      if (allExtractedTransactions.length === 0) {
        throw new ValidationError('AI failed to extract any transactions from the statement.');
      }

      let totalCreditsCents = 0n;
      let totalDebitsCents = 0n;
      let startDate = '9999-12-31';
      let endDate = '0000-01-01';

      const parsedTransactions = allExtractedTransactions.map((tx) => {
        if (tx.date < startDate) startDate = tx.date;
        if (tx.date > endDate) endDate = tx.date;
        
        // Convert to cents
        const amountCents = parseMonetaryCents(tx.amount.toString());
        if (amountCents > 0n) {
          totalCreditsCents += amountCents;
        } else {
          totalDebitsCents += -amountCents;
        }

        return {
          date: normalizeDate(tx.date),
          amountCents,
          description: tx.description,
        };
      });

      parsedTransactions.sort((a, b) => a.date.localeCompare(b.date));

      let openingBalanceCents = 0n;
      let closingBalanceCents = 0n;

      if (globalOpeningBalance !== undefined) {
        openingBalanceCents = parseMonetaryCents(globalOpeningBalance.toString());
      }
      if (globalClosingBalance !== undefined) {
        closingBalanceCents = parseMonetaryCents(globalClosingBalance.toString());
      }

      // Deterministic Mathematical Validation
      if (globalOpeningBalance !== undefined && globalClosingBalance !== undefined) {
        const expectedClosing = openingBalanceCents + totalCreditsCents - totalDebitsCents;
        if (expectedClosing !== closingBalanceCents) {
           console.warn(`[AiStatementParser] Math validation failed. Expected ${expectedClosing}, got ${closingBalanceCents}. Requires Human Review.`);
        }
      }

      return {
        startDate,
        endDate,
        openingBalanceCents,
        closingBalanceCents,
        totalDebitsCents,
        totalCreditsCents,
        transactions: parsedTransactions,
      };

    } catch (error: any) {
      throw new ValidationError(`AI Parsing failed: ${error.message}`);
    }
  }
}
