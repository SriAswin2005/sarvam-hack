import { createReadStream } from 'node:fs';
import { SarvamAIClient } from 'sarvamai';

if (!process.env.SARVAM_API_KEY) throw new Error('Set SARVAM_API_KEY in .env');
const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });
try {
  const result = await client.speechToText.transcribe({
    file: createReadStream(process.argv[2] || 'sample.wav'),
    model: 'saaras:v4',
    mode: 'transcribe',
    language_code: 'unknown',
  });
  console.log(result.transcript);
} catch (error) {
  console.error(`Speech-to-text failed (HTTP ${error.statusCode || 'unknown'}).`);
  process.exitCode = 1;
}
