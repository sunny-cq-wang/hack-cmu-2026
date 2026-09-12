/**
 * Tool definitions + server-side executors for the pet voice agent
 * (P4 task file §6, INTEGRATIONS §1.4 step 3).
 *
 * Every executor returns a compact JSON string for the model and pushes an
 * `actions[]` entry when it has a side effect or a suggestion.
 */
import type OpenAI from 'openai';
import type { VoiceActionSchema } from '@petplate/shared';
import type { z } from 'zod';
import { log } from '../../lib/log';
import { buildToday, compactFromToday } from '../today';
import { computeGaps as getGaps } from '../nutrition/gaps';
import { logFeeding } from '../feedings';
import { suggestMeal } from './suggestMeal';

export type VoiceAction = z.infer<typeof VoiceActionSchema>;

export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_today',
      description: "Today's calories, protein, pet feeding totals and scores for this user.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gaps',
      description: 'Micronutrients the user has been short on over the last 7 days.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_feeding',
      description: "Record that the pet was fed. Omit grams to log one standard meal portion.",
      parameters: {
        type: 'object',
        properties: { grams: { type: 'number', description: 'Grams of food fed' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_meal',
      description: "Suggest one meal sized to the user's remaining calories that helps close nutrient gaps.",
      parameters: {
        type: 'object',
        properties: { constraint: { type: 'string', description: 'Optional preference, e.g. "vegetarian", "quick"' } },
        additionalProperties: false,
      },
    },
  },
];

export interface ToolContext {
  userId: string;
  actions: VoiceAction[];
}

const compact = (value: unknown): string => JSON.stringify(value);

async function topGapsFor(userId: string): Promise<{ label: string; pct: number }[]> {
  const gaps = await getGaps(userId, 7);
  return gaps.gaps.slice(0, 3).map((g) => ({ label: g.label, pct: g.pctOfTarget }));
}

/**
 * Executes one tool call. Unknown names and thrown errors come back as a JSON
 * `{ error }` string so the model can recover inside the same turn.
 */
export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }

  try {
    switch (name) {
      case 'get_today': {
        const today = await buildToday(ctx.userId);
        return compact(compactFromToday(today, await topGapsFor(ctx.userId)));
      }

      case 'get_gaps': {
        const gaps = await getGaps(ctx.userId, 7);
        return compact(gaps.gaps.map((g) => ({ label: g.label, pct: g.pctOfTarget, foods: g.suggestFoods })));
      }

      case 'log_feeding': {
        const grams = typeof args['grams'] === 'number' ? (args['grams'] as number) : undefined;
        const result = await logFeeding(ctx.userId, grams, 'voice');
        ctx.actions.push({
          type: 'log_feeding',
          payload: { grams: result.grams, kcal: result.kcal },
        });
        return compact({
          logged: true,
          grams: result.grams,
          petFedGrams: result.today.pet?.fedGrams ?? 0,
          petTargetGrams: result.today.pet?.targetGrams ?? 0,
        });
      }

      case 'suggest_meal': {
        const today = await buildToday(ctx.userId);
        const gaps = await topGapsFor(ctx.userId);
        const suggestion = await suggestMeal({
          kcalRemaining: compactFromToday(today, gaps).kcalRemaining,
          topGaps: gaps,
          constraint: typeof args['constraint'] === 'string' ? (args['constraint'] as string) : undefined,
        });
        ctx.actions.push({
          type: 'suggest_meal',
          payload: {
            title: suggestion.title,
            kcal: Math.round(suggestion.kcal),
            ingredientLines: suggestion.ingredientLines,
          },
        });
        return compact({ title: suggestion.title, kcal: Math.round(suggestion.kcal) });
      }

      default:
        return compact({ error: `Unknown tool ${name}` });
    }
  } catch (err) {
    log.warn({ tool: name, err: (err as Error).message }, 'voice tool failed');
    return compact({ error: (err as Error).message });
  }
}
