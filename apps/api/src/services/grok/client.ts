import OpenAI from 'openai';
import { config } from '../../config';

export const grok = new OpenAI({
  apiKey: config.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
  timeout: 8000,
  maxRetries: 0,
});
