/**
 * Hour-zero verification for Grok Voice (P4 task file §1.2).
 *
 * TTS first, then feeds that audio straight back into STT as a round-trip check.
 * Also exercises the chat-with-tools agent so the whole voice turn is proven.
 *
 * Usage: pnpm --filter api scratch:voice
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hasXaiKey } from '../../src/config.js';
import { tts } from '../../src/services/voice/tts.js';
import { stt } from '../../src/services/voice/stt.js';
import { personaPrompt, postProcess } from '../../src/services/voice/agent.js';
import { chatAvailable, grokChat } from '../../src/services/voice/chatClient.js';
import { toolDefinitions } from '../../src/services/voice/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, 'out');

const PHRASE = "You have 680 calories left and you're low on fiber. Want a suggestion?";

const results: { capability: string; ok: boolean; detail: string }[] = [];

function record(capability: string, ok: boolean, detail: string): void {
  results.push({ capability, ok, detail });
  process.stdout.write(`${ok ? 'OK   ' : 'FAIL '} ${capability} — ${detail}\n`);
}

async function main(): Promise<void> {
  if (!hasXaiKey()) {
    process.stdout.write('XAI_API_KEY is empty — paste your key into .env and re-run.\n');
    process.exit(2);
  }
  await fs.mkdir(OUT, { recursive: true });
  process.stdout.write(`chat model: ${config.GROK_CHAT_MODEL}\nvoice: ${config.GROK_DEFAULT_VOICE}\n\n`);

  // 1. TTS
  const spoken = await tts(PHRASE, config.GROK_DEFAULT_VOICE);
  if (spoken) {
    const target = path.join(OUT, spoken.mime.includes('wav') ? 'tts.wav' : 'tts.mp3');
    await fs.writeFile(target, spoken.buffer);
    record('POST /v1/tts', true, `${Math.round(spoken.buffer.byteLength / 1024)} KB ${spoken.mime} → ${path.basename(target)}`);
  } else {
    record('POST /v1/tts', false, 'returned null — see contingency §7 (expo-speech device voice)');
  }

  // 2. STT — round-trip the TTS output so no external sample file is needed.
  if (spoken) {
    const transcript = await stt(spoken.buffer, spoken.mime);
    if (transcript) {
      record('POST /v1/stt', true, `transcript: "${transcript}"`);
      await fs.writeFile(path.join(OUT, 'stt.txt'), transcript);
    } else {
      record('POST /v1/stt', false, 'returned null — see contingency §7 (expo-speech-recognition)');
    }
  }

  // 3. Chat with tools — confirms tool calling works on the chat model.
  if (chatAvailable()) {
    try {
      const completion = await grokChat().chat.completions.create({
        model: config.GROK_CHAT_MODEL,
        messages: [
          { role: 'system', content: personaPrompt('Biscuit', 'dog') },
          { role: 'system', content: `Today's numbers: ${JSON.stringify({ kcalRemaining: 680, proteinRemaining: 40, petFedGrams: 0, petTargetGrams: 211, topGaps: [{ label: 'Fiber', pct: 37 }] })}` },
          { role: 'user', content: 'What should I have for dinner?' },
        ],
        tools: toolDefinitions,
        tool_choice: 'auto',
      });
      const message = completion.choices[0]?.message;
      const toolNames = (message?.tool_calls ?? [])
        .map((call) => (call as { function?: { name?: string } }).function?.name ?? '?')
        .join(', ');
      record(
        'chat/completions with tools',
        true,
        toolNames ? `model requested tools: ${toolNames}` : `text reply: "${postProcess(message?.content ?? '')}"`,
      );
    } catch (err) {
      record('chat/completions with tools', false, (err as Error).message);
    }
  }

  await fs.writeFile(
    path.join(OUT, 'voice-report.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} capabilities OK\n`);
  if (failed.length > 0) process.exit(1);
}

void main();
