import { acquirePort } from '@terra-symposium/standards-quality/port';

const port = Number(process.env.DOCS_PLAYWRIGHT_PORT ?? 4335);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DOCS_PLAYWRIGHT_PORT must be an integer between 1 and 65535.');
}

await acquirePort(port);
