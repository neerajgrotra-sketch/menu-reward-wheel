/**
 * Standalone Google Cloud connectivity test.
 *
 * Tests Vertex AI gemini-2.5-flash-image access using the exact same
 * OAuth JWT flow as the production provider, with zero app code involved.
 *
 * Usage:
 *   GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY='<json>' node scripts/test-gemini-direct.mjs
 *
 * The key must be the raw service account JSON string (same value as the
 * GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY environment variable in Vercel).
 */

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECT_ID = 'spinbite-ai-production';
const LOCATION   = 'us-central1';
const MODEL      = 'gemini-2.5-flash-image';

const ENDPOINT =
  `https://${LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${PROJECT_ID}/locations/${LOCATION}` +
  `/publishers/google/models/${MODEL}:generateContent`;

const REQUEST_BODY = {
  contents: [{ parts: [{ text: 'A bowl of ramen noodles with soft-boiled egg' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: '1:1' },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function separator(label) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

function ts() {
  return new Date().toISOString();
}

// ── JWT signing (identical to production provider) ────────────────────────────

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function signJwt(header, payload, privateKeyPem) {
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const keyData = Buffer.from(pemBody, 'base64');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput),
  );

  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

// ── OAuth token exchange (identical to production provider) ───────────────────

async function getAccessToken(serviceAccount) {
  const scope = 'https://www.googleapis.com/auth/cloud-platform';
  const now   = Math.floor(Date.now() / 1000);

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope,
  };

  separator('STEP 1 — Signing JWT');
  console.log('  iss (service account email):', serviceAccount.client_email);
  console.log('  aud:', payload.aud);
  console.log('  scope:', scope);
  console.log('  iat:', now, '/ exp:', now + 3600);

  const jwt = await signJwt(header, payload, serviceAccount.private_key);
  console.log('\n  JWT (first 80 chars):', jwt.slice(0, 80) + '…');

  separator('STEP 2 — OAuth2 token exchange');
  console.log('  POST https://oauth2.googleapis.com/token');
  console.log('  grant_type: urn:ietf:params:oauth:grant-type:jwt-bearer');

  const t0 = Date.now();
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenLatency = Date.now() - t0;

  console.log(`\n  Response status : ${tokenRes.status} ${tokenRes.statusText}`);
  console.log(`  Latency         : ${tokenLatency}ms`);
  console.log('  Response headers:');
  for (const [k, v] of tokenRes.headers.entries()) {
    console.log(`    ${k}: ${v}`);
  }

  const tokenText = await tokenRes.text();
  console.log('\n  Raw response body:');
  console.log(tokenText);

  if (!tokenRes.ok) {
    throw new Error(`OAuth token exchange failed — HTTP ${tokenRes.status}:\n${tokenText}`);
  }

  const tokenData = JSON.parse(tokenText);
  const token = tokenData.access_token;
  console.log('\n  access_token (first 40 chars):', token.slice(0, 40) + '…');
  console.log('  token_type  :', tokenData.token_type);
  console.log('  expires_in  :', tokenData.expires_in, 'seconds');

  return token;
}

// ── Gemini API call ───────────────────────────────────────────────────────────

async function callGemini(accessToken) {
  separator('STEP 3 — Calling Vertex AI Gemini endpoint');
  console.log('  Method  : POST');
  console.log('  Endpoint:', ENDPOINT);
  console.log('  Model   :', MODEL);
  console.log('  Project :', PROJECT_ID);
  console.log('  Location:', LOCATION);
  console.log('\n  Request body:');
  console.log(JSON.stringify(REQUEST_BODY, null, 4));

  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(REQUEST_BODY),
    signal: AbortSignal.timeout(60_000),
  });
  const latency = Date.now() - t0;

  separator('STEP 4 — Raw Vertex AI response');
  console.log(`  HTTP status : ${res.status} ${res.statusText}`);
  console.log(`  Latency     : ${latency}ms`);
  console.log('  Response headers:');
  for (const [k, v] of res.headers.entries()) {
    console.log(`    ${k}: ${v}`);
  }

  const rawText = await res.text();

  console.log('\n  Raw response body (full):');

  // Try to pretty-print JSON; fall back to raw text.
  try {
    const parsed = JSON.parse(rawText);

    // Truncate base64 image data so the log stays readable.
    if (parsed.candidates) {
      for (const candidate of parsed.candidates) {
        for (const part of candidate?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const full = part.inlineData.data;
            part.inlineData.data = `[BASE64 TRUNCATED — ${full.length} chars]`;
          }
        }
      }
    }

    console.log(JSON.stringify(parsed, null, 4));
  } catch {
    console.log(rawText);
  }

  separator('STEP 5 — Diagnosis');
  if (res.ok) {
    console.log('  ✓ HTTP 200 — Google accepted the request.');
    console.log('  ✓ gemini-2.5-flash-image is accessible for project:', PROJECT_ID);
    console.log('  ✓ Service account has sufficient permissions.');

    let imageCount = 0;
    try {
      const parsed = JSON.parse(rawText);
      for (const candidate of parsed.candidates ?? []) {
        for (const part of candidate?.content?.parts ?? []) {
          if (part.inlineData?.data) imageCount++;
        }
      }
    } catch { /* ignore */ }

    if (imageCount > 0) {
      console.log(`  ✓ ${imageCount} image(s) returned in response.`);
    } else {
      console.log('  ⚠ No inlineData images found in response — check generationConfig.');
    }
  } else {
    console.log(`  ✗ HTTP ${res.status} — request failed.`);
    console.log('  Likely causes by status:');
    if (res.status === 401) console.log('    401 — Bearer token invalid or expired.');
    if (res.status === 403) console.log('    403 — Service account lacks permission OR model not enabled for this project.');
    if (res.status === 404) console.log('    404 — Model not found in this region. Try a different LOCATION.');
    if (res.status === 429) console.log('    429 — Quota exceeded.');
    if (res.status === 400) console.log('    400 — Invalid request body.');
    if (res.status === 500) console.log('    500 — Google-side error. Retry.');
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  separator('Google Cloud Vertex AI — Gemini Direct Connectivity Test');
  console.log(`  Timestamp : ${ts()}`);
  console.log(`  Node.js   : ${process.version}`);
  console.log(`  Project   : ${PROJECT_ID}`);
  console.log(`  Model     : ${MODEL}`);

  const rawKey = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('\n  FATAL: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY env var is not set.');
    console.error('  Run as:');
    console.error("    GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY='<json>' node scripts/test-gemini-direct.mjs");
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawKey);
    console.log('\n  Service account parsed OK.');
    console.log('  client_email:', serviceAccount.client_email);
    console.log('  project_id  :', serviceAccount.project_id);
    const hasKey = typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.length > 0;
    console.log('  private_key :', hasKey ? `present (${serviceAccount.private_key.length} chars)` : 'MISSING');
    if (!hasKey) throw new Error('private_key is missing from service account JSON');
  } catch (e) {
    console.error('\n  FATAL: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY is not valid JSON:', e.message);
    process.exit(1);
  }

  try {
    const accessToken = await getAccessToken(serviceAccount);
    await callGemini(accessToken);
  } catch (e) {
    separator('FATAL ERROR');
    console.error('  ', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }

  separator('Done');
  console.log(`  Completed at: ${ts()}`);
}

main();
