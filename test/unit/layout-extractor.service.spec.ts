import * as fs from 'fs';

import { describe, it, expect, beforeEach } from 'vitest';

import { DocumentInspectorService } from '../../src/modules/banking/parsers/layout/document-inspector.service';
import { LayoutExtractorService } from '../../src/modules/banking/parsers/layout/layout-extractor.service';

describe('LayoutExtractorService', () => {
  let inspector: DocumentInspectorService;
  let service: LayoutExtractorService;

  beforeEach(() => {
    inspector = new DocumentInspectorService();
    service = new LayoutExtractorService(inspector);
  });

  it('separates table lines from recurring disclaimer boilerplate', async () => {
    const mockContent = `%PDF-1.4
URUSNIAGA AKAUN/ 戶口進支項 /ACCOUNT TRANSACTIONS
ENTRY DATE VALUE DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
BEGINNING BALANCE 13,863.00
01/06 TRANSFER FR A/C 1,500.00- 12,363.00
KATERING SELERA RAK*
Selera katerin
01/06 TRANSFER FR A/C 1,496.85- 10,866.15
NOVI FROZEN FOODS *
Maybank Islamic Berhad (787435-M)
15th Floor, Tower A, Dataran Maybank, 1, Jalan Maarof, 59000 Kuala Lumpur.
TARIKH PENYATA : 30/06/26
NOMBOR AKAUN : 562106965671
PROTECTED BY PIDM UP TO RM250,000 FOR EACH DEPOSITOR
Perhatian / Note
Semua maklumat dan baki yang dinyatakan di sini akan dianggap betul
%%EOF`;

    const layout = await service.extractLayout(Buffer.from(mockContent));

    expect(layout.pageCount).toBe(1);
    expect(layout.detectedBank).toBe('MAYBANK_ISLAMIC');

    const page1 = layout.pages[0];
    expect(page1).toBeDefined();
    if (!page1) {
      return;
    }

    expect(page1.tableLines).toContain('BEGINNING BALANCE 13,863.00');
    expect(page1.tableLines).toContain('01/06 TRANSFER FR A/C 1,500.00- 12,363.00');
    expect(page1.tableLines).toContain('KATERING SELERA RAK*');
    expect(page1.tableLines).toContain('NOVI FROZEN FOODS *');

    // Disclaimer lines should be filtered into metadataLines
    expect(page1.metadataLines).toContain('Maybank Islamic Berhad (787435-M)');
    expect(page1.metadataLines).toContain('TARIKH PENYATA : 30/06/26');
    expect(page1.metadataLines).toContain('Perhatian / Note');
    expect(page1.tableLines).not.toContain('Perhatian / Note');
  });

  it('processes user-uploaded Maybank Islamic PDF cleanly across multiple pages', async () => {
    const samplePath =
      '/Users/mac/.gemini/antigravity-ide/brain/d44abbed-46c7-4efe-a0d2-9be9c276e091/.user_uploaded/media_1791297352686.pdf';

    if (fs.existsSync(samplePath)) {
      const buffer = fs.readFileSync(samplePath);
      const layout = await service.extractLayout(buffer);

      expect(layout.pageCount).toBe(5);
      expect(layout.detectedBank).toBe('MAYBANK_ISLAMIC');
      expect(layout.detectedFormat).toBe('MAYBANK_TRILINGUAL_STATEMENT');

      // Verify page 1
      const page1 = layout.pages[0];
      expect(page1).toBeDefined();
      if (!page1) {
        return;
      }

      expect(page1.tableLines[0]).toBe('URUSNIAGA AKAUN/ 戶口進支項 /ACCOUNT TRANSACTIONS');
      expect(page1.tableLines.some((l) => l.includes('BEGINNING BALANCE 13,863.00'))).toBe(true);

      // Verify page 5 table lines have transactions
      const page5 = layout.pages[4];
      expect(page5).toBeDefined();
      if (!page5) {
        return;
      }

      expect(page5.tableLines.some((l) => l.includes('DUITNOW QR-'))).toBe(true);
      // Footers isolated into metadataLines
      expect(page5.metadataLines.some((l) => l.includes('Maybank Islamic Berhad'))).toBe(true);
    }
  });
});
