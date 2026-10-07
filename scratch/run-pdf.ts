import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PdfStatementParser } from '../src/modules/banking/parsers/pdf-statement.parser';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const pdfParser = app.get(PdfStatementParser);

  const files = [
    '/Users/mac/.gemini/antigravity-ide/brain/d44abbed-46c7-4efe-a0d2-9be9c276e091/.user_uploaded/media_1791274283259.pdf',
    '/Users/mac/.gemini/antigravity-ide/brain/d44abbed-46c7-4efe-a0d2-9be9c276e091/.user_uploaded/media_1791274516280.pdf',
    '/Users/mac/.gemini/antigravity-ide/brain/d44abbed-46c7-4efe-a0d2-9be9c276e091/.user_uploaded/media_1791274763670.pdf',
  ];

  for (const file of files) {
    console.log(`\n--- Processing ${file} ---`);
    try {
      const buffer = fs.readFileSync(file);
      const result = await pdfParser.parse(buffer);
      console.log('Result extracted lines count:', result.length);
      console.log('First 3 lines:', result.slice(0, 3));
    } catch (e) {
      console.error('Error processing:', e);
    }
  }

  await app.close();
}

bootstrap();
