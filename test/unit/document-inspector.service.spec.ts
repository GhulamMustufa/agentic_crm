import * as fs from 'fs';

import { describe, it, expect, beforeEach } from 'vitest';

import { DocumentInspectorService } from '../../src/modules/banking/parsers/layout/document-inspector.service';

describe('DocumentInspectorService', () => {
  let service: DocumentInspectorService;

  beforeEach(() => {
    service = new DocumentInspectorService();
  });

  it('rejects buffers missing PDF magic bytes', async () => {
    const invalidBuffer = Buffer.from('Not a PDF file');
    const result = await service.inspect(invalidBuffer);

    expect(result.isValidPdf).toBe(false);
    expect(result.suggestedMode).toBe('UNSUPPORTED');
    expect(result.reasons).toContain('Missing %PDF- header magic bytes');
  });

  it('detects encrypted PDF markers', async () => {
    const encryptedPdfMock = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n%%EOF');
    const result = await service.inspect(encryptedPdfMock);

    expect(result.isValidPdf).toBe(true);
    expect(result.isEncrypted).toBe(true);
    expect(result.suggestedMode).toBe('UNSUPPORTED');
    expect(result.detectedFormat).toBe('ENCRYPTED_PDF');
  });

  it('detects Maybank Islamic branding and extracts metadata', async () => {
    const mockContent = `%PDF-1.4
Maybank Islamic Berhad (787435-M)
15th Floor, Tower A, Dataran Maybank, 1, Jalan Maarof, 59000 Kuala Lumpur.
URUSNIAGA AKAUN/ 戶口進支項 /ACCOUNT TRANSACTIONS
STATEMENT DATE : 30/06/26
NOMBOR AKAUN : 562106965671
ENTRY DATE VALUE DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
BEGINNING BALANCE 13,863.00
01/06 TRANSFER FR A/C 1,500.00- 12,363.00
%%EOF`;

    const result = await service.inspect(Buffer.from(mockContent));

    expect(result.isValidPdf).toBe(true);
    expect(result.detectedBank).toBe('MAYBANK_ISLAMIC');
    expect(result.bankDisplayName).toBe('Maybank Islamic Berhad');
    expect(result.accountNumber).toBe('562106965671');
    expect(result.statementDate).toBe('30/06/26');
    expect(result.detectedFormat).toBe('MAYBANK_TRILINGUAL_STATEMENT');
    expect(result.suggestedMode).toBe('NATIVE_TEXT');
  });

  it('detects CIMB Bank branding correctly', async () => {
    const mockContent = `%PDF-1.4
CIMB Bank Berhad
Account No : 8001234567
Statement Period : 01/05/2026 to 31/05/2026
Date Description Withdrawal Deposit Balance
02/05 SALARY 5,000.00 15,000.00
%%EOF`;

    const result = await service.inspect(Buffer.from(mockContent));

    expect(result.isValidPdf).toBe(true);
    expect(result.detectedBank).toBe('CIMB');
    expect(result.bankDisplayName).toBe('CIMB Bank Berhad');
    expect(result.accountNumber).toBe('8001234567');
    expect(result.statementDate).toBe('31/05/2026');
    expect(result.detectedFormat).toBe('CIMB_STANDARD_STATEMENT');
    expect(result.suggestedMode).toBe('NATIVE_TEXT');
  });

  it('detects Public Bank Berhad branding', async () => {
    const mockContent = `%PDF-1.4
Public Bank Berhad
Nombor Akaun: 3124567890
Tarikh Urusniaga Wang Keluar Wang Masuk Baki
01/04 PEMINDAHAN 50.00 1,000.00
%%EOF`;

    const result = await service.inspect(Buffer.from(mockContent));

    expect(result.isValidPdf).toBe(true);
    expect(result.detectedBank).toBe('PUBLIC_BANK');
    expect(result.bankDisplayName).toBe('Public Bank Berhad');
    expect(result.accountNumber).toBe('3124567890');
    expect(result.detectedFormat).toBe('PUBLIC_BANK_STATEMENT');
  });

  it('inspects actual user uploaded Maybank Islamic statement file if present', async () => {
    const samplePath =
      '/Users/mac/.gemini/antigravity-ide/brain/d44abbed-46c7-4efe-a0d2-9be9c276e091/.user_uploaded/media_1791297352686.pdf';

    if (fs.existsSync(samplePath)) {
      const buffer = fs.readFileSync(samplePath);
      const result = await service.inspect(buffer);

      expect(result.isValidPdf).toBe(true);
      expect(result.isEncrypted).toBe(false);
      expect(result.pageCount).toBe(5);
      expect(result.isSearchableText).toBe(true);
      expect(result.detectedBank).toBe('MAYBANK_ISLAMIC');
      expect(result.accountNumber).toBe('562106965671');
      expect(result.statementDate).toBe('30/06/26');
      expect(result.suggestedMode).toBe('NATIVE_TEXT');
      expect(result.detectedFormat).toBe('MAYBANK_TRILINGUAL_STATEMENT');
    }
  });
});
