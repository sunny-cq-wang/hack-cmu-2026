import type { ZodType } from 'zod';
import { config } from '../../config';
import { log } from '../../lib/log';
import { grok } from './client';

export async function grokJson<T>(opts: {
  system: string;
  user: string;
  schema: ZodType<T>;
  timeoutMs: number;
  jsonSchemaName: string;
  jsonSchema: Record<string, unknown>;
}): Promise<T> {
  const started = Date.now();
  try {
    const res = await grok.chat.completions.create(
      {
        model: config.GROK_CHAT_MODEL,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        // why: xAI json_schema typing is not in the OpenAI SDK
        response_format: {
          type: 'json_schema',
          json_schema: { name: opts.jsonSchemaName, strict: true, schema: opts.jsonSchema },
        } as never,
      },
      { timeout: opts.timeoutMs },
    );
    const content = res.choices[0]?.message.content;
    if (!content) throw new Error('empty chat content');
    const parsed = opts.schema.parse(JSON.parse(content) as unknown);
    log.info({ model: config.GROK_CHAT_MODEL, latencyMs: Date.now() - started, success: true }, 'grok chat');
    return parsed;
  } catch (err) {
    log.warn({ err, latencyMs: Date.now() - started, success: false }, 'grok chat json_schema failed, retrying json_object');
    const res = await grok.chat.completions.create(
      {
        model: config.GROK_CHAT_MODEL,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: { type: 'json_object' },
      },
      { timeout: opts.timeoutMs },
    );
    const content = res.choices[0]?.message.content;
    if (!content) throw err;
    const parsed = opts.schema.parse(JSON.parse(content) as unknown);
    log.info({ model: config.GROK_CHAT_MODEL, latencyMs: Date.now() - started, success: true }, 'grok chat');
    return parsed;
  }
}
