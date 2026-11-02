import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// Read .env directly
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
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

console.log(
  'Gemini API Key prefix:',
  apiKey ? apiKey.substring(0, 8) + '...' : 'NONE',
  'Length:',
  apiKey.length,
);

const client = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

async function main() {
  try {
    const res = await client.chat.completions.create({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'Say hello in one word' }],
      max_tokens: 10,
    });
    console.log('Gemini Response:', res.choices[0]?.message?.content);
  } catch (err) {
    console.error('Gemini error:', err?.message || err);
    if (err?.status) console.error('Status:', err.status);
    if (err?.error) console.error('Details:', err.error);
  }
}

main();
