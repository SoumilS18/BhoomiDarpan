import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Phase B lean key probe: ONE data.gov.in request, prints only the HTTP
 * status, timing, and a body excerpt with the key value redacted. Never
 * prints the key, the URL, or any credential-shaped string.
 */
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const key = (process.env.LGD_DATA_GOV_API_KEY || '').trim();
if (!key) {
  console.log('KEY=absent');
  process.exit(2);
}

const url =
  'https://api.data.gov.in/resource/a71e60f0-a21d-43de-a6c5-fa5d21600cdb' +
  `?api-key=${encodeURIComponent(key)}&format=json&limit=1`;

const started = Date.now();
try {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const ms = Date.now() - started;
  let body = '';
  try {
    body = await resp.text();
  } catch {
    body = '';
  }
  const safe = body.split(key).join('[REDACTED]').slice(0, 400);
  console.log(`HTTP=${resp.status} in ${ms}ms`);
  console.log(`BODY_HEAD=${safe}`);
  console.log(
    `VERDICT=${
      resp.status === 200
        ? 'KEY_AUTHORISED'
        : resp.status === 403
          ? 'REQUIRES_CREDENTIALS_403'
          : `UNEXPECTED_${resp.status}`
    }`
  );
} catch (error: any) {
  console.log(`FETCH_ERROR=${error?.message ?? 'unknown'} after ${Date.now() - started}ms`);
  console.log('VERDICT=NETWORK_OR_TIMEOUT');
}
