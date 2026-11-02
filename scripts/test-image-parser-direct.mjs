import fs from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ImageStatementParser } from '../src/modules/banking/parsers/image-statement.parser';

async function main() {
  console.log('Bootstrapping test context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const parser = app.get(ImageStatementParser);

  const testFile = path.resolve(
    'sample_statements/stress_test/images/01_clean_chase_statement.png',
  );
  const buffer = fs.readFileSync(testFile);

  console.log('Testing ImageStatementParser with 01_clean_chase_statement.png...');
  const start = Date.now();
  const parsed = await parser.parse(buffer);
  console.log('✅ Parsed successfully in', Date.now() - start, 'ms');
  console.log('Bank:', parsed.bankName);
  console.log('Account Number Last 4:', parsed.accountNumberLast4);
  console.log('Date range:', parsed.startDate, 'to', parsed.endDate);
  console.log('Opening Balance Cents:', parsed.openingBalanceCents.toString());
  console.log('Closing Balance Cents:', parsed.closingBalanceCents.toString());
  console.log('Total Debits Cents:', parsed.totalDebitsCents.toString());
  console.log('Total Credits Cents:', parsed.totalCreditsCents.toString());
  console.log('Transaction Count:', parsed.transactions.length);
  for (const tx of parsed.transactions) {
    console.log(
      `  - [${tx.date}] ${tx.direction} $${(Number(tx.amountCents) / 100).toFixed(2)} | ${tx.description}`,
    );
  }

  await app.close();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
