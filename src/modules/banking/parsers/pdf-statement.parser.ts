import { Injectable } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';

import { BankAdapterRegistry } from './adapters/bank-adapter.registry';
import { AiStatementParser } from './ai-statement.parser';
import { DocumentInspectorService } from './layout/document-inspector.service';
import { LayoutExtractorService } from './layout/layout-extractor.service';
import { ValidationError } from '../../../core/errors/app-error';

import type { IStatementParser, ParsedStatementResult } from './statement-parser.interface';

export async function extractTextFromPdfBuffer(rawBuffer: Buffer): Promise<string> {
  try {
    const mod = pdfParseModule as unknown as Record<string, unknown>;
    if (mod && typeof mod.PDFParse === 'function') {
      const PDFParse = mod.PDFParse as new (data: Uint8Array) => {
        getText: () => Promise<unknown>;
      };
      const instance = new PDFParse(new Uint8Array(rawBuffer));
      const res = await instance.getText();
      if (typeof res === 'string') {
        return res;
      }
      if (res && typeof (res as { text?: string }).text === 'string') {
        return (res as { text: string }).text;
      }
    }
    if (typeof mod === 'function') {
      const res = await (mod as (buf: Buffer) => Promise<{ text?: string }>)(rawBuffer);
      if (res && typeof res.text === 'string') {
        return res.text;
      }
    }
  } catch (err) {
    console.warn('PDF text extraction error:', err);
  }
  return rawBuffer.toString('utf-8');
}

export class MalformedPdfError extends ValidationError {
  constructor(reason: string) {
    super(`Malformed PDF statement: ${reason}`);
    this.name = 'MalformedPdfError';
  }
}

@Injectable()
export class PdfStatementParser implements IStatementParser {
  private readonly inspectorService: DocumentInspectorService;
  private readonly layoutExtractor: LayoutExtractorService;
  private readonly adapterRegistry: BankAdapterRegistry;

  constructor(
    private readonly aiParser: AiStatementParser,
    inspectorService?: DocumentInspectorService,
    layoutExtractor?: LayoutExtractorService,
    adapterRegistry?: BankAdapterRegistry,
  ) {
    this.inspectorService = inspectorService ?? new DocumentInspectorService();
    this.layoutExtractor = layoutExtractor ?? new LayoutExtractorService(this.inspectorService);
    this.adapterRegistry = adapterRegistry ?? new BankAdapterRegistry();
  }

  async parse(content: string | Buffer): Promise<ParsedStatementResult> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64');

    const rawStr = rawBuffer.toString('binary');

    // 1. PDF Header and EOF verification
    if (!rawStr.includes('%PDF-')) {
      throw new MalformedPdfError('Missing %PDF- header magic bytes');
    }
    if (!rawStr.includes('%%EOF') && !rawStr.includes('trailer')) {
      throw new MalformedPdfError('Truncated or corrupted PDF: missing EOF trailer marker');
    }

    // 2. Document Inspection & Security
    const inspection = await this.inspectorService.inspect(rawBuffer);
    if (!inspection.isValidPdf) {
      throw new MalformedPdfError(inspection.reasons[0] || 'Invalid PDF structure');
    }
    if (inspection.isEncrypted) {
      throw new MalformedPdfError(
        'Password-protected or encrypted PDF statements are not supported',
      );
    }

    // 3. Layout Extraction
    const layout = await this.layoutExtractor.extractLayout(rawBuffer);

    // 4. Resolve Bank Adapter & Parse
    const adapter = this.adapterRegistry.getAdapter(inspection);
    const result = await adapter.parse(layout, inspection);

    // 5. Fallback to AI vision parser if 0 transactions extracted and AI parser is available
    if (
      result.transactions.length === 0 &&
      this.aiParser &&
      typeof this.aiParser.parse === 'function'
    ) {
      const aiResult = await this.aiParser.parse(content);
      return {
        ...aiResult,
        pageCount: layout.pageCount,
        extractionMode: 'AI_VISION',
        bankDetected: inspection.detectedBank,
        formatDetected: inspection.detectedFormat,
        parserVersion: '2.1.0-ai-fallback',
        metadata: {
          ...aiResult.metadata,
          inspectionReasons: inspection.reasons,
          confidence: inspection.confidence,
        },
      };
    }

    return result;
  }
}
