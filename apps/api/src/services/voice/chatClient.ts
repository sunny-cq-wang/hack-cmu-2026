/**
 * OpenAI-compatible client for the xAI chat API (INTEGRATIONS §1).
 *
 * TODO(P2): P2 owns `services/grok/client.ts`. This local instance exists so the
 * voice agent does not block on it; delete and import theirs once it lands.
 */
import OpenAI from 'openai';
import { config, hasXaiKey } from '../../config';

let client: OpenAI | null = null;

export function grokChat(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.XAI_API_KEY,
      baseURL: config.XAI_BASE_URL,
      timeout: 15_000,
      maxRetries: 0,
    });
  }
  return client;
}

export const chatAvailable = (): boolean => hasXaiKey();
