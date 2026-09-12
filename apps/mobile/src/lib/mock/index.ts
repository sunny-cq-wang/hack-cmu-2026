// MOCK ONLY — not shipped logic; server owns all math (AGENTS.md §4.3)
//
// Importing this module registers the in-memory API with `api.ts`, but only when
// EXPO_PUBLIC_MOCK_API=true. `app/_layout.tsx` imports it once, for its side effect.
import { setMockTransport } from '../api';
import { config } from '../config';
import { log } from '../log';
import * as store from './store';

export { resetMockStore } from './store';

/** Enough delay that skeletons and spinners are actually visible while developing. */
const LATENCY_MS = 300;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function jsonBody(raw: unknown): unknown {
  // Multipart bodies (FormData) are ignored: the mock never looks at the photo.
  return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
}

function queryParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    params[key] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
  }
  return params;
}

export async function handleMockRequest(method: string, path: string, rawBody: unknown): Promise<unknown> {
  await wait(LATENCY_MS);

  const [pathname = '', search = ''] = path.split('?');
  const params = queryParams(search);
  const body = jsonBody(rawBody);
  const route = `${method} ${pathname}`;

  log.info('mock', 'served locally', { route });

  switch (route) {
    case 'POST /me/bootstrap':
      return store.bootstrap();
    case 'PUT /me/profile':
      return store.putProfile(body);
    case 'GET /me/today':
      return store.getToday();
    case 'POST /meals/analyze':
      return store.analyzeMeal();
    case 'POST /meals':
      return store.createMeal(body);
    case 'GET /meals':
      return store.listMeals(params.date ?? null);
    case 'GET /nutrition/gaps':
      return store.getGaps(Number(params.days ?? 7));
    case 'POST /mealplans/generate':
      return store.generatePlan(body);
    case 'POST /pets':
      return store.createPet(body);
    case 'GET /scores':
      return store.getScores(params.from ?? null, params.to ?? null);
    case 'GET /avatar/status':
      return store.getAvatarStatus();
    case 'GET /health':
      return { ok: true, demoMode: true };
    default:
      break;
  }

  if (method === 'DELETE' && pathname.startsWith('/meals/')) {
    store.deleteMeal(pathname.slice('/meals/'.length));
    return undefined;
  }
  if (method === 'GET' && pathname.startsWith('/pets/')) {
    return store.getPet();
  }
  if (method === 'POST' && /^\/pets\/[^/]+\/feedings$/.test(pathname)) {
    return store.createFeeding(body);
  }

  throw new Error(`mock: no handler for ${route}`);
}

if (config.mockApi) {
  setMockTransport(handleMockRequest);
  log.warn('mock', 'EXPO_PUBLIC_MOCK_API is ON — no request will reach the real API.');
}
