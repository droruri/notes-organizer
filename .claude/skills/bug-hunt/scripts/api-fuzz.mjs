#!/usr/bin/env node
// Sends generic bad requests to every route and prints only the suspicious answers. App-agnostic.
//
//   node discover-routes.mjs <dirs> | node api-fuzz.mjs --api <API_URL> --out <run-dir> [--safe]
//        [--routes <file of discover-routes lines>] [--public <regex>] [--skip-routes <regex>]
//
// Bearer token: env TOKEN (optional). It is never printed or written.
// Writes <out>/api-fuzz.jsonl (every request) and prints a summary plus anomalies only.
//
// --safe (remote mode): only probes that cannot create or change data — no auth, bad token,
// malformed bodies, GETs with bad ids and query strings. No wrong-method writes, no valid-looking
// bodies, no huge bodies.
//
// Field-level probes (wrong types per field, server-owned fields) need the schemas: do those by
// hand from the report's list of write routes.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const api = (args.api ?? die('--api is required')).replace(/\/$/, '');
const outDir = resolve(args.out ?? die('--out is required'));
const safe = 'safe' in args;
const publicRe = new RegExp(args.public ?? '^/(health|healthz|ping|status)?$', 'i');
const skipRe = args['skip-routes'] ? new RegExp(args['skip-routes'], 'i') : null;
const token = process.env.TOKEN ?? '';
mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'api-fuzz.jsonl');
writeFileSync(logFile, '');

const LEAK =
  /\n\s+at .+:\d+:\d+|node_modules|\/src\/\S+\.[jt]s|syntax error at or near|violates \S+ constraint|relation "\S+" does not exist|ECONNREFUSED|\bSELECT\b.+\bFROM\b|\bINSERT INTO\b/i;
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const raw = args.routes ? readFileSync(args.routes, 'utf8') : readFileSync(0, 'utf8');
const routes = new Map(); // path -> Set(methods)
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (skipRe?.test(r.path)) continue;
  const methods = r.method === 'ANY' || r.method === 'ALL' ? ['GET'] : [r.method];
  const set = routes.get(r.path) ?? new Set();
  methods.forEach((m) => set.add(m));
  routes.set(r.path, set);
}

const anomalies = new Map();
const writeRoutes = [];
let sent = 0;
let unreachable = 0;

for (const [path, methods] of routes) {
  for (const method of methods) {
    if (WRITE.has(method)) writeRoutes.push(`${method} ${path}`);
    await fuzz(method, path, methods);
  }
}
report();

// ---------------------------------------------------------------------------------------------

async function fuzz(method, path, registered) {
  const url = fill(path, randomUUID());
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const route = `${method} ${path}`;
  const isPublic = publicRe.test(path);
  let stop = false;
  const send = async (probe, m, u, opts = {}) => {
    if (stop) return null;
    const r = await call(m, u, opts);
    sent++;
    if (r.status === 0) unreachable++;
    appendFileSync(logFile, JSON.stringify({ route, probe, method: m, url: u.replace(api, ''), ...r }) + '\n');
    if (r.status === 429) {
      stop = true;
      note(route, 'rate limited (429), stopped probing this route', probe);
    }
    if (r.status >= 500) note(route, `HTTP ${r.status}`, probe, r.snippet);
    if (LEAK.test(r.body)) note(route, 'error body leaks internals', probe, r.snippet);
    if (r.ms > 5000) note(route, 'slower than 5 s', probe);
    return r;
  };
  const ok = (r) => r && r.status >= 200 && r.status < 300;

  // Auth
  const noAuth = await send('no auth', method, url, { auth: false, body: hasBody ? '{}' : undefined });
  if (ok(noAuth) && !isPublic) note(route, 'succeeds without valid auth', 'no auth');
  const bad = await send('garbage token', method, url, { auth: 'Bearer bh.invalid.token', body: hasBody ? '{}' : undefined });
  if (ok(bad) && !isPublic) note(route, 'succeeds without valid auth', 'garbage token');

  // Path params
  if (/[:{[]/.test(path) && (!safe || method === 'GET')) {
    for (const [label, v] of [
      ['non-uuid id', 'not-a-uuid'], ['id 0', '0'], ['id -1', '-1'], ['300-char id', 'x'.repeat(300)],
      ['encoded ../', '%2e%2e%2f'], ['sql id', "1' or '1'='1"],
    ]) {
      const r = await send(label, method, fill(path, v), { body: hasBody ? '{}' : undefined });
      if (ok(r) && method !== 'GET') note(route, 'write succeeds with a bad id', label);
    }
  }

  // Bodies
  if (hasBody) {
    const bodies = [
      ['no body', undefined, true],
      ['malformed JSON', '{"a":', true],
      ['text/plain body', 'hello', false],
    ];
    if (!safe) {
      bodies.push(['array body', '[]', true], ['null body', 'null', true], ['string body', '"x"', true],
        ['100k string field', JSON.stringify({ text: 'a'.repeat(100_000), body: 'a'.repeat(100_000) }), true]);
    }
    for (const [label, body, json] of bodies) {
      const r = await send(label, method, url, { body, json });
      if (ok(r) && label !== '100k string field') note(route, 'accepts an invalid body', label);
    }
    if (!safe) {
      const r = await send('empty object', method, url, { body: '{}' });
      if (ok(r)) note(route, 'accepts {} (check required fields)', 'empty object');
    }
  }

  // Query strings
  if (method === 'GET') {
    const q = `limit=-1&offset=abc&page=0&q=${'x'.repeat(2000)}&sort=%3Bdrop&id=not-a-uuid`;
    await send('bad query string', 'GET', `${url}${url.includes('?') ? '&' : '?'}${q}`);
  }

  // Wrong method on the same path
  for (const m of ALL) {
    if (registered.has(m) || (safe && m !== 'GET')) continue;
    if (m === 'GET' && registered.has('HEAD')) continue;
    const r = await send(`wrong method ${m}`, m, url, { body: m === 'GET' || m === 'DELETE' ? undefined : '{}' });
    if (ok(r)) note(route, 'unregistered method succeeds', m);
  }
}

async function call(method, url, { auth = true, body, json = true } = {}) {
  const headers = {};
  if (auth === true && token) headers.authorization = `Bearer ${token}`;
  else if (typeof auth === 'string') headers.authorization = auth;
  if (body !== undefined || (json && ['POST', 'PUT', 'PATCH'].includes(method))) {
    headers['content-type'] = json ? 'application/json' : 'text/plain';
  }
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    return { status: res.status, ms: Date.now() - t0, body: text, snippet: redact(text).slice(0, 160) };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, body: '', snippet: `network error: ${e.cause?.code ?? e.name}` };
  }
}

// One anomaly per route and reason; the probes that hit it are listed together.
function note(route, reason, probe, snippet) {
  const key = `${route} ${reason}`;
  const a = anomalies.get(key) ?? { route, reason, probes: [], snippet };
  if (!a.probes.includes(probe)) a.probes.push(probe);
  anomalies.set(key, a);
}

function report() {
  if (sent && unreachable === sent) die(`no answer from ${api} (${sent} requests failed); is the API running?`);
  console.log(
    `api-fuzz: ${sent} requests, ${routes.size} paths, mode ${safe ? 'safe' : 'full'}` +
      `${token ? '' : ' (no TOKEN: authed probes ran without auth)'}, ${anomalies.size} anomalies`,
  );
  let i = 0;
  for (const a of anomalies.values()) {
    console.log(`B${++i} ${a.route}: ${a.reason} (${a.probes.join(', ')})${a.snippet ? `\n   body: ${a.snippet.replace(/\s+/g, ' ')}` : ''}`);
  }
  if (writeRoutes.length) console.log(`write routes for field-level probes by hand: ${writeRoutes.join(', ')}`);
  console.log(`full log: ${logFile}`);
}

// --- utils ------------------------------------------------------------------------------------

function fill(path, v) {
  const p = path
    .replace(/:\w+\??/g, v)
    .replace(/\{[^}]+\}/g, v)
    .replace(/\[\[?\.{0,3}\w+\]\]?/g, v)
    .replace(/\$\{[^}]+\}/g, v)
    .replace(/\*/g, v);
  return api + p;
}
function redact(s) {
  return s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').replace(/Bearer\s+\S+/gi, 'Bearer <redacted>');
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) die(`unexpected argument ${argv[i]}`);
    const k = argv[i].slice(2);
    if (k === 'safe') out.safe = true;
    else out[k] = argv[++i];
  }
  return out;
}
function die(msg) {
  console.error(`api-fuzz: ${msg}`);
  process.exit(1);
}
