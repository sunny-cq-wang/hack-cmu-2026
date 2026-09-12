/**
 * The talking-pet agent: Grok chat + server-side tools (INTEGRATIONS §1.4).
 * Never throws — a total upstream failure becomes a canned reply built from
 * today's real numbers.
 */
import type OpenAI from 'openai';
import { config } from '../../config';
import { store as db } from '../../db/connect';
import { log } from '../../lib/log';
import { buildToday, compactFromToday, type CompactToday } from '../today';
import { computeGaps as getGaps } from '../nutrition/gaps';
import { chatAvailable, grokChat } from './chatClient';
import { executeTool, toolDefinitions, type ToolContext, type VoiceAction } from './tools';

const MAX_TOOL_ROUNDS = 3;
const TOTAL_BUDGET_MS = 15_000;
export const MAX_REPLY_CHARS = 320;

/** Persona prompt, verbatim from INTEGRATIONS §1.4. */
export function personaPrompt(petName: string, species: string): string {
  return `You are ${petName}, a ${species} who is also the user's diet buddy. Speak in first person as the pet, warm, 1–3 sentences, no emojis. Use British English (Received Pronunciation): supper not dinner, fancy a walk, brilliant, rather. You know today's numbers (provided). Be concrete: cite calories remaining and the top nutrient gap. If the user asks you to log your own feeding, call log_feeding. If they ask what to eat, call suggest_meal and read back the title and calories. Never give medical advice; suggest a vet or doctor for health questions.`;
}

// Emoji, pictographs, dingbats and variation selectors.
const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu;

export function postProcess(reply: string): string {
  const cleaned = reply.replace(EMOJI_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
  if (cleaned.length <= MAX_REPLY_CHARS) return cleaned;

  // Prefer cutting at a sentence end so the spoken reply does not stop mid-word.
  const window = cleaned.slice(0, MAX_REPLY_CHARS);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  return lastStop > 120 ? window.slice(0, lastStop + 1).trim() : `${window.trimEnd()}…`;
}

export function cannedReply(compact: CompactToday): string {
  const gap = compact.topGaps[0]?.label.toLowerCase();
  const kcal = `You have ${compact.kcalRemaining} calories left`;
  const gapPart = gap ? ` and you're low on ${gap}` : '';
  return `${kcal}${gapPart}. Want a suggestion?`;
}

export interface PetAgentResult {
  reply: string;
  actions: VoiceAction[];
}

export async function runPetAgent(userId: string, userText: string): Promise<PetAgentResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const ctx: ToolContext = { userId, actions: [] };

  const today = await buildToday(userId);
  const gaps = await getGaps(userId, 7).catch(() => null);
  const topGaps = (gaps?.gaps ?? []).slice(0, 3).map((g) => ({ label: g.label, pct: g.pctOfTarget }));
  const compact = compactFromToday(today, topGaps);

  const pet = await db.findPetByUserId(userId);
  const petName = pet?.name ?? 'Buddy';
  const species = pet?.species ?? 'dog';

  if (!chatAvailable()) {
    log.warn('voice agent: no XAI_API_KEY, returning canned reply');
    return { reply: postProcess(cannedReply(compact)), actions: ctx.actions };
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: personaPrompt(petName, species) },
    { role: 'system', content: `Today's numbers: ${JSON.stringify(compact)}` },
    { role: 'user', content: userText },
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      const completion = await grokChat().chat.completions.create(
        {
          model: config.GROK_CHAT_MODEL,
          messages,
          tools: toolDefinitions,
          tool_choice: 'auto',
        },
        { timeout: remaining },
      );

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      const calls = choice.tool_calls ?? [];
      if (calls.length === 0) {
        const reply = choice.content?.trim();
        if (reply) return { reply: postProcess(reply), actions: ctx.actions };
        break;
      }

      messages.push(choice);
      for (const call of calls) {
        // why: the SDK union covers custom tools too; only function calls are configured here.
        const fn = (call as { function?: { name?: string; arguments?: string } }).function;
        const output = await executeTool(fn?.name ?? '', fn?.arguments ?? '', ctx);
        messages.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
    }
    log.warn({ userId }, 'voice agent produced no text reply — using canned');
  } catch (err) {
    log.warn({ userId, err: (err as Error).message }, 'voice agent failed — using canned reply');
  }

  return { reply: postProcess(cannedReply(compact)), actions: ctx.actions };
}
