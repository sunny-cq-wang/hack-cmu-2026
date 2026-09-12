/**
 * Tiny logger. AGENTS.md §4.9 bans `console.log` in committed code, so this is
 * the only place the console is touched: `warn`/`error` always, `info` only in
 * development builds.
 */

type Meta = Record<string, unknown>;

function format(scope: string, message: string, meta?: Meta): string {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[petplate:${scope}] ${message}${suffix}`;
}

export const log = {
  info(scope: string, message: string, meta?: Meta): void {
    if (__DEV__) {
      console.info(format(scope, message, meta));
    }
  },
  warn(scope: string, message: string, meta?: Meta): void {
    console.warn(format(scope, message, meta));
  },
  error(scope: string, message: string, meta?: Meta): void {
    console.error(format(scope, message, meta));
  },
};
