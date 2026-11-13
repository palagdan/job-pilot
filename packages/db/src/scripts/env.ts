/**
 * Minimal env access for db CLI scripts. Apps use their own validated config (packages/config, Daniil's M0 item).
 * Scripts run with `node --env-file-if-exists=../../.env`, so the root `.env` is loaded.
 */
export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env in the repo root.`);
    process.exit(1);
  }
  return value;
};

/** Destructive scripts refuse to run against anything but a local database. */
export const assertLocalDatabase = (url: string): void => {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    console.error(`Refusing to run against non-local database host "${host}".`);
    process.exit(1);
  }
};
