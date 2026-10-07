import { Injectable, Logger } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';

import { DocumentInspectorService } from './document-inspector.service';

import type { ExtractedPage, StructuredDocumentLayout } from './layout.types';

@Injectable()
export class LayoutExtractorService {
  private readonly logger = new Logger(LayoutExtractorService.name);

  // Patterns that define boilerplate footer banners and legal disclaimers
  private static readonly BOILERPLATE_PATTERNS: RegExp[] = [
    /Maybank\s*Islamic\s*Berhad\s*\(/i,
    /Malayan\s*Banking\s*Berhad\s*\(/i,
    /15th\s*Floor,\s*Tower\s*A,\s*Dataran\s*Maybank/i,
    /MUKA\/\s*頁\s*\/PAGE\s*:/i,
    /TARIKH\s*PENYATA/i,
    /結單日期/i,
    /STATEMENT\s*DATE/i,
    /NOMBOR\s*AKAUN/i,
    /戶號/i,
    /ACCOUNT\s*NUMBER/i,
    /PROTECTED\s*BY\s*PIDM/i,
    /NOT\s*PROTECTED\s*BY\s*PIDM/i,
    /Applicable\s*for\s*PA-i\s*minor/i,
    /BAKI\s*LEGAR\s*=\s*BAKI\s*AKHIR/i,
    /可應用存餘\s*=/i,
    /LEDGER\s*BALANCE\s*=\s*ENDING\s*BALANCE/i,
    /Perhatian\s*\/\s*Note/i,
    /Semua\s*maklumat\s*dan\s*baki/i,
    /若银行在21天内未获得/i,
    /All\s*items\s*and\s*balances\s*shown\s*will\s*be\s*considered\s*correct/i,
    /Sila\s*beritahu\s*kami\s*sebarang\s*pertukaran\s*alamat/i,
    /請通知本行在何地址更换/i,
    /Please\s*notify\s*us\s*of\s*any\s*change\s*of\s*address/i,
    /Faedah\s*merujuk\s*kepada\s*wang/i,
    /利息”是指您从常规账户/i,
    /Interest\s*refers\s*to\s*the\s*money\s*earned/i,
    /Wang\s*yang\s*keluar\s*berlebihan/i,
    /本欄内誌DR者爲結欠/i,
    /ditandakan\s*dengan\s*DR/i,
    /Overdrawn\s*balances\s*are/i,
    /denoted\s*by\s*DR/i,
    /SME\s*FIRST\s*ACCOUNT/i,
  ];

  constructor(private readonly inspectorService: DocumentInspectorService) {}

  /**
   * Extracts structured page-by-page layout with isolated table and metadata zones.
   */
  async extractLayout(content: Buffer | Uint8Array | string): Promise<StructuredDocumentLayout> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
        ? Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64')
        : Buffer.from(content);

    const inspection = await this.inspectorService.inspect(rawBuffer);

    let rawPages: Array<{ num: number; text: string }> = [];

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

        if (
          typeof res === 'object' &&
          res !== null &&
          Array.isArray(res.pages) &&
          res.pages.length > 0
        ) {
          rawPages = res.pages;
        } else if (typeof res === 'string') {
          rawPages = [{ num: 1, text: res }];
        } else if (res && typeof res === 'object' && typeof res.text === 'string') {
          rawPages = [{ num: 1, text: res.text }];
        }
      } else if (typeof mod === 'function') {
        const res = await (mod as (buf: Buffer) => Promise<{ text?: string }>)(rawBuffer);
        rawPages = [{ num: 1, text: res.text ?? '' }];
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`PDF parser warning during layout extraction: ${msg}`);
      rawPages = [{ num: 1, text: rawBuffer.toString('utf-8') }];
    }

    if (rawPages.length === 0) {
      rawPages = [{ num: 1, text: rawBuffer.toString('utf-8') }];
    }

    const pages: ExtractedPage[] = rawPages.map((p, idx) => {
      const pageNum = p.num || idx + 1;
      const rawText = p.text || '';
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const tableLines: string[] = [];
      const metadataLines: string[] = [];

      let reachedFooterDisclaimer = false;

      for (const line of lines) {
        if (this.isBoilerplateDisclaimer(line)) {
          reachedFooterDisclaimer = true;
          metadataLines.push(line);
          continue;
        }

        if (reachedFooterDisclaimer) {
          // Once in footer disclaimer zone, subsequent lines belong to metadata
          metadataLines.push(line);
        } else {
          tableLines.push(line);
        }
      }

      return {
        pageNumber: pageNum,
        rawText,
        lines,
        tableLines,
        metadataLines,
      };
    });

    const totalCharacters = pages.reduce((acc, p) => acc + p.rawText.length, 0);

    return {
      pageCount: pages.length,
      totalCharacters,
      pages,
      detectedBank: inspection.detectedBank,
      detectedFormat: inspection.detectedFormat,
    };
  }

  private isBoilerplateDisclaimer(line: string): boolean {
    return LayoutExtractorService.BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line));
  }
}
