import { describe, it, expect, beforeEach } from 'vitest';

import { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
import { ValidationError } from '../../src/core/errors/app-error';
import { ImageStatementParser } from '../../src/modules/banking/parsers/image-statement.parser';

describe('ImageStatementParser - Multimodal AI Vision Extraction', () => {
  let aiGateway: AiGatewayService;
  let imageParser: ImageStatementParser;

  // Minimal valid PNG buffer
  const samplePngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

  beforeEach(() => {
    aiGateway = new AiGatewayService();
    imageParser = new ImageStatementParser(aiGateway);
  });

  it('1. should extract structured bank statement from a valid statement image', async () => {
    const mockExtractionData = {
      isRecognizedBankStatement: true,
      isBlurryOrUnreadable: false,
      bankName: 'Chase Business Banking',
      accountType: 'CHECKING',
      accountNumberLast4: '4129',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      openingBalance: 10000.0,
      closingBalance: 12500.0,
      transactions: [
        {
          date: '2026-10-05',
          description: 'WIRE TRANSFER FROM ACME CORP',
          amount: 3000.0,
        },
        {
          date: '2026-10-12',
          description: 'AMAZON WEB SERVICES CLOUD HOSTING',
          amount: -500.0,
        },
      ],
    };

    // Encode mock JSON payload in data URI base64 so MockAiProvider parses it deterministically
    const dataWithPayload = Buffer.concat([
      samplePngBuffer,
      Buffer.from(JSON.stringify(mockExtractionData)),
    ]);

    const result = await imageParser.parse(dataWithPayload);

    expect(result.extractionMode).toBe('AI_VISION');
    expect(result.formatDetected).toBe('IMAGE_BANK_STATEMENT');
    expect(result.bankName).toBe('Chase Business Banking');
    expect(result.accountNumberLast4).toBe('4129');
    expect(result.openingBalanceCents).toBe(1000000n);
    expect(result.closingBalanceCents).toBe(1250000n);
    expect(result.totalCreditsCents).toBe(300000n);
    expect(result.totalDebitsCents).toBe(50000n);
    expect(result.transactions).toHaveLength(2);

    expect(result.transactions[0]!.description).toBe('WIRE TRANSFER FROM ACME CORP');
    expect(result.transactions[0]!.amountCents).toBe(300000n);
    expect(result.transactions[0]!.direction).toBe('CREDIT');

    expect(result.transactions[1]!.description).toBe('AMAZON WEB SERVICES CLOUD HOSTING');
    expect(result.transactions[1]!.amountCents).toBe(-50000n);
    expect(result.transactions[1]!.direction).toBe('DEBIT');
  });

  it('2. should reject non-bank images (e.g. restaurant receipt, selfie, cat photo) with ValidationError', async () => {
    const nonBankData = {
      isRecognizedBankStatement: false,
      unrecognizedReason:
        'Image appears to be a dining receipt from Olive Garden, not an official bank statement',
      isBlurryOrUnreadable: false,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      openingBalance: 0,
      closingBalance: 0,
      transactions: [],
    };

    const dataWithPayload = Buffer.concat([
      samplePngBuffer,
      Buffer.from(JSON.stringify(nonBankData)),
    ]);

    await expect(imageParser.parse(dataWithPayload)).rejects.toThrow(ValidationError);
    await expect(imageParser.parse(dataWithPayload)).rejects.toThrow(
      'Image appears to be a dining receipt from Olive Garden',
    );
  });

  it('3. should flag blurry/unreadable image metadata when clarity is compromised', async () => {
    const blurryData = {
      isRecognizedBankStatement: true,
      isBlurryOrUnreadable: true,
      bankName: 'Maybank Malaysia',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      openingBalance: 5000.0,
      closingBalance: 5000.0,
      transactions: [],
    };

    const dataWithPayload = Buffer.concat([
      samplePngBuffer,
      Buffer.from(JSON.stringify(blurryData)),
    ]);

    const result = await imageParser.parse(dataWithPayload);
    expect(result.metadata?.isBlurryOrUnreadable).toBe(true);
  });

  it('4. should reject corrupted files with invalid magic bytes immediately before invoking AI', async () => {
    const corruptedBuffer = Buffer.from('NOT_AN_IMAGE_PAYLOAD_AT_ALL');

    await expect(imageParser.parse(corruptedBuffer)).rejects.toThrow(ValidationError);
    await expect(imageParser.parse(corruptedBuffer)).rejects.toThrow(
      'do not match valid PNG, JPEG, or WebP image signature bytes',
    );
  });
});
