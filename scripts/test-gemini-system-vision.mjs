import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

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

async function main() {
  const imagePath = path.resolve(
    'sample_statements/stress_test/images/01_clean_chase_statement.png',
  );
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const dataUri = `data:image/png;base64,${imageBase64}`;

  console.log('Testing system message + image with Gemini 3.5 Flash-Lite...');
  try {
    const res = await client.chat.completions.create({
      model: 'gemini-3.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: 'You are a bank statement parser. Respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract: isRecognizedBankStatement, bankName, openingBalance, closingBalance, transactions.',
            },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });
    console.log('Success! Gemini extracted:');
    console.log(res.choices[0]?.message?.content);
  } catch (err) {
    console.error('System + Vision error:', err);
  }
}

main();
