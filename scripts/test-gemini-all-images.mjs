import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';

const envContent = fs.readFileSync('.env', 'utf-8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('GEMINI_API_KEY=')) {
    apiKey = line
      .substring('GEMINI_API_KEY='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
    break;
  }
}

const client = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const schema = z.object({
  isRecognizedBankStatement: z.boolean(),
  unrecognizedReason: z.string().optional(),
  isBlurryOrUnreadable: z.boolean(),
  bankName: z.string().optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']).optional(),
  accountNumberLast4: z.string().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  openingBalance: z.number().default(0),
  closingBalance: z.number().default(0),
  transactions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string(),
        amount: z.number(),
      }),
    )
    .default([]),
});

const prompt = `You are a forensic bank document extraction engine.
Analyze the provided document image and extract:
1. 'isRecognizedBankStatement': boolean. True ONLY if document is clearly a bank account statement. Set false if receipt, invoice, or non-bank photo.
2. 'isBlurryOrUnreadable': boolean. True if text is blurred, obscured, or illegible.
3. 'bankName': Name of institution.
4. 'openingBalance': Opening cash balance.
5. 'closingBalance': Closing cash balance.
6. 'startDate' and 'endDate': ISO dates (YYYY-MM-DD).
7. 'transactions': Array of rows with 'date', 'description', 'amount'. Debits negative, deposits positive.`;

async function testImage(filename) {
  const filePath = path.resolve('sample_statements/stress_test/images', filename);
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;

  console.log(`\n======================================================`);
  console.log(`Testing Gemini on: ${filename}`);
  console.log(`======================================================`);

  try {
    const res = await client.chat.completions.create({
      model: 'gemini-3.5-flash-lite',
      messages: [
        { role: 'system', content: prompt + '\nRespond ONLY with valid JSON.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract data according to schema.' },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    console.log('Result:', JSON.stringify(parsed, null, 2));

    const opening = parsed.openingBalance || 0;
    const closing = parsed.closingBalance || 0;
    const txSum = (parsed.transactions || []).reduce((acc, tx) => acc + (tx.amount || 0), 0);
    const expectedClosing = Math.round((opening + txSum) * 100) / 100;
    const mathMatches = Math.abs(expectedClosing - closing) < 0.01;

    console.log(`- Is Bank Statement: ${parsed.isRecognizedBankStatement}`);
    console.log(`- Is Blurry/Unreadable: ${parsed.isBlurryOrUnreadable}`);
    console.log(
      `- Math Check: Opening(${opening}) + Sum(${txSum}) = ${expectedClosing} vs Closing(${closing}) => ${mathMatches ? '✅ BALANCED' : '❌ MISMATCH'}`,
    );
  } catch (err) {
    console.error(`Error on ${filename}:`, err);
  }
}

async function run() {
  await testImage('01_clean_chase_statement.png');
  await testImage('02_blurry_unbalanced_statement.png');
  await testImage('03_dining_receipt_not_bank.png');
}

run();
