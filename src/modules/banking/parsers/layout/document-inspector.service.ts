import { Injectable, Logger } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';

import type { BankCode, DocumentInspectionResult, SuggestedExtractionMode } from './layout.types';

@Injectable()
export class DocumentInspectorService {
  private readonly logger = new Logger(DocumentInspectorService.name);

  /**
   * Inspects a PDF statement buffer to determine structural validity,
   * text extractability, page count, and bank branding signals.
   */
  async inspect(content: Buffer | Uint8Array | string): Promise<DocumentInspectionResult> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
        ? Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64')
        : Buffer.from(content);

    const rawStr = rawBuffer.toString('binary');
    const reasons: string[] = [];

    // 1. Verify standard PDF signature
    const hasPdfHeader = rawStr.includes('%PDF-');
    const hasEof = rawStr.includes('%%EOF') || rawStr.includes('trailer');

    if (!hasPdfHeader) {
      return {
        isValidPdf: false,
        isEncrypted: false,
        pageCount: 0,
        totalCharacters: 0,
        averageCharsPerPage: 0,
        isSearchableText: false,
        detectedBank: 'UNKNOWN',
        bankDisplayName: 'Unknown Bank',
        detectedFormat: 'INVALID_HEADER',
        suggestedMode: 'UNSUPPORTED',
        confidence: 0,
        reasons: ['Missing %PDF- header magic bytes'],
      };
    }

    // 2. Encryption detection
    const isEncrypted = rawStr.includes('/Encrypt');
    if (isEncrypted) {
      reasons.push('Document contains /Encrypt dictionary marker');
    }

    // 3. Extract text content and page metrics
    let pageCount = 1;
    let fullText = '';
    let isSearchableText = false;

    try {
      const mod = pdfParseModule as unknown as Record<string, unknown>;
      if (mod && typeof mod.PDFParse === 'function') {
        const PDFParseClass = mod.PDFParse as new (data: Uint8Array) => {
          getText: () => Promise<
            { text?: string; pages?: Array<{ num: number; text: string }>; total?: number } | string
          >;
        };
        const instance = new PDFParseClass(new Uint8Array(rawBuffer));
        const res = await instance.getText();

        if (typeof res === 'string') {
          fullText = res;
        } else if (res && typeof res === 'object') {
          fullText = res.text ?? '';
          if (typeof res.total === 'number' && res.total > 0) {
            pageCount = res.total;
          } else if (Array.isArray(res.pages) && res.pages.length > 0) {
            pageCount = res.pages.length;
          }
        }
      } else if (typeof mod === 'function') {
        const res = await (mod as (buf: Buffer) => Promise<{ text?: string; numpages?: number }>)(
          rawBuffer,
        );
        fullText = res.text ?? '';
        if (typeof res.numpages === 'number' && res.numpages > 0) {
          pageCount = res.numpages;
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`PDF parse warning during inspection: ${errorMsg}`);
      reasons.push(`Text extraction encountered parser warning: ${errorMsg}`);
      fullText = rawBuffer.toString('utf-8');
    }

    const totalCharacters = fullText.trim().length;
    const averageCharsPerPage = pageCount > 0 ? Math.round(totalCharacters / pageCount) : 0;

    // A document is considered natively searchable text if it has >= 40 characters per page average
    isSearchableText = averageCharsPerPage >= 40;

    // 4. Identify Bank signals
    const { detectedBank, bankDisplayName, confidence, bankReasons } = this.detectBank(fullText);
    reasons.push(...bankReasons);

    // 5. Detect Account Number & Statement Date
    const accountNumber = this.extractAccountNumber(fullText, detectedBank);
    const statementDate = this.extractStatementDate(fullText);

    // 6. Determine format & suggested processing mode
    let detectedFormat = 'GENERIC_STATEMENT';
    let suggestedMode: SuggestedExtractionMode = 'NATIVE_TEXT';

    if (isEncrypted) {
      suggestedMode = 'UNSUPPORTED';
      detectedFormat = 'ENCRYPTED_PDF';
    } else if (!isSearchableText) {
      suggestedMode = 'OCR_ASSISTED';
      detectedFormat = 'SCANNED_OR_FLATTENED_PDF';
      reasons.push(
        `Low text density (${averageCharsPerPage} chars/page) indicates scanned or flattened image PDF`,
      );
    } else if (detectedBank === 'MAYBANK' || detectedBank === 'MAYBANK_ISLAMIC') {
      if (/URUSNIAGA AKAUN|戶口進支項|ACCOUNT TRANSACTIONS/i.test(fullText)) {
        detectedFormat = 'MAYBANK_TRILINGUAL_STATEMENT';
      } else {
        detectedFormat = 'MAYBANK_STANDARD_STATEMENT';
      }
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'CIMB') {
      detectedFormat = 'CIMB_STANDARD_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'PUBLIC_BANK') {
      detectedFormat = 'PUBLIC_BANK_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'RHB') {
      detectedFormat = 'RHB_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'HONG_LEONG') {
      detectedFormat = 'HONG_LEONG_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'AMBANK') {
      detectedFormat = 'AMBANK_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (detectedBank === 'BANK_ISLAM') {
      detectedFormat = 'BANK_ISLAM_STATEMENT';
      suggestedMode = 'NATIVE_TEXT';
    } else if (
      detectedBank === 'OCBC' ||
      detectedBank === 'UOB' ||
      detectedBank === 'ALLIANCE' ||
      detectedBank === 'AFFIN' ||
      detectedBank === 'HSBC' ||
      detectedBank === 'STANDARD_CHARTERED'
    ) {
      detectedFormat = `${detectedBank}_STATEMENT`;
      suggestedMode = 'NATIVE_TEXT';
    }

    if (!hasEof) {
      reasons.push('Non-standard EOF trailer structure, but text stream parsed');
    }

    return {
      isValidPdf: true,
      isEncrypted,
      pageCount,
      totalCharacters,
      averageCharsPerPage,
      isSearchableText,
      detectedBank,
      bankDisplayName,
      detectedFormat,
      suggestedMode,
      accountNumber,
      statementDate,
      confidence,
      reasons,
    };
  }

  private detectBank(text: string): {
    detectedBank: BankCode;
    bankDisplayName: string;
    confidence: number;
    bankReasons: string[];
  } {
    const reasons: string[] = [];

    // Maybank Islamic check
    if (/Maybank\s*Islamic/i.test(text)) {
      reasons.push('Matched explicit "Maybank Islamic" branding');
      return {
        detectedBank: 'MAYBANK_ISLAMIC',
        bankDisplayName: 'Maybank Islamic Berhad',
        confidence: 0.99,
        bankReasons: reasons,
      };
    }

    // Conventional Maybank check
    if (/Maybank|Malayan\s*Banking\s*Berhad|\bMBB\b/i.test(text)) {
      reasons.push('Matched Maybank / Malayan Banking Berhad branding');
      return {
        detectedBank: 'MAYBANK',
        bankDisplayName: 'Malayan Banking Berhad (Maybank)',
        confidence: 0.95,
        bankReasons: reasons,
      };
    }

    // CIMB
    if (/CIMB\s*Bank|CIMB\s*Islamic|CIMB\s*Niaga|\bCIMB\b/i.test(text)) {
      reasons.push('Matched CIMB Bank branding');
      return {
        detectedBank: 'CIMB',
        bankDisplayName: 'CIMB Bank Berhad',
        confidence: 0.95,
        bankReasons: reasons,
      };
    }

    // Public Bank
    if (/Public\s*Bank\s*Berhad|Public\s*Islamic|\bPBB\b/i.test(text)) {
      reasons.push('Matched Public Bank Berhad branding');
      return {
        detectedBank: 'PUBLIC_BANK',
        bankDisplayName: 'Public Bank Berhad',
        confidence: 0.95,
        bankReasons: reasons,
      };
    }

    // RHB
    if (/RHB\s*Bank|RHB\s*Islamic|\bRHB\b/i.test(text)) {
      reasons.push('Matched RHB Bank branding');
      return {
        detectedBank: 'RHB',
        bankDisplayName: 'RHB Bank Berhad',
        confidence: 0.95,
        bankReasons: reasons,
      };
    }

    // Hong Leong
    if (/Hong\s*Leong\s*Bank|Hong\s*Leong\s*Islamic|\bHLB\b/i.test(text)) {
      reasons.push('Matched Hong Leong Bank branding');
      return {
        detectedBank: 'HONG_LEONG',
        bankDisplayName: 'Hong Leong Bank Berhad',
        confidence: 0.95,
        bankReasons: reasons,
      };
    }

    // AmBank
    if (/AmBank|AmBank\s*Islamic|\bAMMB\b/i.test(text)) {
      reasons.push('Matched AmBank branding');
      return {
        detectedBank: 'AMBANK',
        bankDisplayName: 'AmBank (M) Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // Bank Islam
    if (/Bank\s*Islam\s*Malaysia|Bank\s*Islam\b/i.test(text)) {
      reasons.push('Matched Bank Islam Malaysia branding');
      return {
        detectedBank: 'BANK_ISLAM',
        bankDisplayName: 'Bank Islam Malaysia Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // OCBC
    if (/OCBC\s*Bank|OCBC\s*Al-Amin|\bOCBC\b/i.test(text)) {
      reasons.push('Matched OCBC Bank branding');
      return {
        detectedBank: 'OCBC',
        bankDisplayName: 'OCBC Bank (Malaysia) Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // UOB
    if (/United\s*Overseas\s*Bank|\bUOB\b/i.test(text)) {
      reasons.push('Matched UOB Bank branding');
      return {
        detectedBank: 'UOB',
        bankDisplayName: 'United Overseas Bank (Malaysia) Bhd',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // Affin Bank
    if (/Affin\s*Bank|Affin\s*Islamic|\bAffin\b/i.test(text)) {
      reasons.push('Matched Affin Bank branding');
      return {
        detectedBank: 'AFFIN',
        bankDisplayName: 'Affin Bank Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // Alliance Bank
    if (/Alliance\s*Bank|Alliance\s*Islamic/i.test(text)) {
      reasons.push('Matched Alliance Bank branding');
      return {
        detectedBank: 'ALLIANCE',
        bankDisplayName: 'Alliance Bank Malaysia Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // Standard Chartered
    if (/Standard\s*Chartered/i.test(text)) {
      reasons.push('Matched Standard Chartered Bank branding');
      return {
        detectedBank: 'STANDARD_CHARTERED',
        bankDisplayName: 'Standard Chartered Bank Malaysia',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    // HSBC
    if (/HSBC\s*Bank|HSBC\s*Amanah|\bHSBC\b/i.test(text)) {
      reasons.push('Matched HSBC Bank branding');
      return {
        detectedBank: 'HSBC',
        bankDisplayName: 'HSBC Bank Malaysia Berhad',
        confidence: 0.9,
        bankReasons: reasons,
      };
    }

    reasons.push('No recognized Malaysian bank branding markers found');
    return {
      detectedBank: 'UNKNOWN',
      bankDisplayName: 'Unknown Financial Institution',
      confidence: 0.1,
      bankReasons: reasons,
    };
  }

  private extractAccountNumber(text: string, detectedBank: BankCode): string | undefined {
    // 1. Maybank formatted: 12 digits (e.g., 562106965671)
    if (detectedBank === 'MAYBANK' || detectedBank === 'MAYBANK_ISLAMIC') {
      const maybankMatch = text.match(
        /(?:NOMBOR AKAUN|ACCOUNT\s*NUMBER|A\/C\s*NO)\s*[:.\s]*(\d{10,14})/i,
      );
      if (maybankMatch?.[1]) {
        return maybankMatch[1].trim();
      }
    }

    // 2. Generic account number regex
    const genericMatch = text.match(
      /(?:Account\s*No|Nombor\s*Akaun|A\/C\s*No|Account\s*#|戶號)\s*[:.\s]*([0-9-]{8,20})/i,
    );
    if (genericMatch?.[1]) {
      return genericMatch[1].replace(/[^0-9]/g, '');
    }

    return undefined;
  }

  private extractStatementDate(text: string): string | undefined {
    // Maybank trilingual statement date: STATEMENT DATE : 30/06/26 or 30/06/2026
    const dateMatch = text.match(
      /(?:STATEMENT\s*DATE|TARIKH\s*PENYATA|結單日期)\s*[:.\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    );
    if (dateMatch?.[1]) {
      return dateMatch[1].trim();
    }

    const periodEndMatch = text.match(
      /(?:Statement\s*Period|Tempoh\s*Penyata)\s*[:.\s]*[^\n\r]+?(?:to|-|hingga|至)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    );
    if (periodEndMatch?.[1]) {
      return periodEndMatch[1].trim();
    }

    return undefined;
  }
}
