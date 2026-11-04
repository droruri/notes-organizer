#!/usr/bin/env node
// Crawls a web app breadth-first: clicks every visible control, runs input probes, and records
// what each action opened plus anything that looks wrong. App-agnostic.
//
//   node crawl.mjs --url <WEB_URL> --out <run-dir> [--state <storage-state.json>]
//                  [--pw <dir where playwright is installed>] [--block-writes <API origin>]
//                  [--script <Unicode script, e.g. Hebrew>] [--targets <file of labels>]
//                  [--max-actions 300] [--depth 3] [--skip <regex>]
//
// Writes <out>/crawl.jsonl (one record per action) and <out>/inventory.json.
// Prints only a summary and the anomalies, so the caller reads a few lines instead of page dumps.
//
// --block-writes aborts every non-GET request to that origin (remote mode: the crawl is read-only).
// --skip names controls that are never clicked (default: delete / clear / sign-out words); they are
// listed so the caller can probe them by hand.

import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_SKIP =
  'sign ?out|log ?out|התנתק|יציאה|delete|remove|מחק|מחיקה|הסר|clear|נקה|reset|איפוס|archive|ארכב';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const INPUTS = [
  ['empty', ''],
  ['spaces', '   '],
  ['5000 chars', 'BH ' + 'a'.repeat(5000)],
  ['500-char word', 'BH ' + 'x'.repeat(500)],
  ['emoji', 'BH 👩🏽‍💻🇮🇱 é'],
  ['mixed direction', 'BH שלום hello 123 עולם'],
  ['html', 'BH <img src=x onerror="window.__bh_xss=1"><b>x</b>'],
  ['sql', "BH '; drop table x; --"],
  ['template', 'BH {{7*7}} ${7*7}'],
];

const args = parseArgs(process.argv.slice(2));
const startUrl = args.url ?? die('--url is required');
const outDir = resolve(args.out ?? die('--out is required'));
const maxActions = Number(args['max-actions'] ?? 300);
const maxDepth = Number(args.depth ?? 3);
const blockOrigin = args['block-writes'];
const skipRe = new RegExp(args.skip ?? DEFAULT_SKIP, 'i');
const targets = args.targets
  ? readFileSync(args.targets, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
  : null;
const origin = new URL(startUrl).origin;
mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'crawl.jsonl');
writeFileSync(logFile, '');

const chromium = loadChromium(args.pw ?? '.');
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: DESKTOP,
  ...(args.state ? { storageState: args.state } : {}),
});
let ev = fresh();
if (blockOrigin) {
  await context.route(
    (u) => u.href.startsWith(blockOrigin),
    (route) => {
      const q = route.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(q.method())) return route.continue();
      ev.blocked.push(`${q.method()} ${pathOf(q.url())}`);
      return route.abort('blockedbyclient');
    },
  );
}
const page = await context.newPage();
context.on('page', (p) => {
  if (p === page) return;
  ev.popups.push(p.url());
  p.close().catch(() => {});
});
// "Failed to load resource" repeats a status the response log already has.
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
    ev.console.push(m.text().slice(0, 200));
  }
});
page.on('pageerror', (e) => ev.pageErrors.push(String(e.message).slice(0, 200)));
page.on('dialog', (d) => {
  ev.native.push(`${d.type()}: ${d.message().slice(0, 100)}`);
  d.dismiss().catch(() => {});
});
page.on('response', (r) => {
  const q = r.request();
  if (!['xhr', 'fetch', 'document'].includes(q.resourceType())) return;
  ev.responses.push({ method: q.method(), url: r.url(), status: r.status() });
});

const queue = [];
const seen = new Set();
const screens = new Map();
const anomalies = new Map();
const skipped = [];
const noChange = [];
let actions = 0;

try {
  await reach([]);
  const root = await listing();
  if (root.checks.url.split('#')[0] !== startUrl.split('#')[0]) {
    console.log(`crawl: start URL redirected to ${root.checks.url} (not signed in? pass --state)`);
  }
  const rootScreen = screenOf(root.checks);
  judge({ repro: '(page load)', screen: rootScreen }, root.checks, 'load');
  await screenCheck(rootScreen, '(page load)');
  enqueue(root.controls, [], rootScreen);

  while (queue.length && actions < maxActions) {
    const it = queue.shift();
    await run(it);
  }
} finally {
  await browser.close();
}
report();

// ---------------------------------------------------------------------------------------------

async function run(it) {
  const c = it.target;
  const rec = { i: ++actions, screen: it.screen, key: c.key, repro: repro(it.path, c) };
  if (targets) rec.inScope = targets.some((t) => rec.repro.includes(t));
  const skip = c.disabled
    ? 'disabled'
    : c.role === 'file'
      ? 'file input'
      : c.href && !sameOrigin(c.href)
        ? `external link ${c.href}`
        : skipRe.test(c.name)
          ? 'destructive or sign-out: probe by hand'
          : null;
  if (skip) {
    rec.kind = 'skip';
    rec.why = skip;
    if (!c.disabled) skipped.push(`${rec.repro} (${skip})`);
    return log(rec);
  }
  if (!(await reach(it.path))) {
    rec.kind = 'unreachable';
    return log(rec);
  }

  if (isTextInput(c)) return inputProbes(it, rec);
  if (c.type === 'select-one' || c.type === 'select-multiple') return selectProbes(it, rec);

  const before = await listing();
  ev = fresh();
  if (!(await act(c, 'click'))) {
    rec.kind = 'click-failed';
    addAnomaly(rec, 'cannot click it (covered, detached or moving)');
    return log(rec);
  }
  const st = await settle();
  const after = await listing();
  rec.kind = 'click';
  rec.opened = diff(before, after);
  rec.requests = ev.responses.map((r) => `${r.method} ${pathOf(r.url)} ${r.status}`);
  rec.writes = writes();
  if (ev.blocked.length) rec.blocked = ev.blocked;
  if (ev.native.length) rec.native = ev.native;
  if (ev.popups.length) rec.popups = ev.popups;
  judge(rec, st, 'click');

  const o = rec.opened;
  if (!o.urlChanged && !o.dialogsDelta && !o.added.length && !o.removed && !ev.responses.length &&
      !ev.native.length && !ev.popups.length) {
    rec.noChange = true;
    noChange.push(rec.repro);
  }
  if (!sameOrigin(after.checks.url)) {
    rec.leftApp = after.checks.url;
  } else if (o.added.length && it.path.length + 1 <= maxDepth) {
    const screen = screenOf(after.checks);
    const isNew = !screens.has(screen);
    const addedKeys = new Set(o.added);
    enqueue(after.controls.filter((x) => addedKeys.has(x.key)), [...it.path, pick(c)], screen);
    if (isNew) await screenCheck(screen, rec.repro);
  }

  // Double-click: does one click's write go out twice?
  if (rec.writes.length && !blockOrigin && c.role === 'button' && (await reach(it.path))) {
    ev = fresh();
    if (await act(c, 'dblclick')) {
      await settle();
      const w = writes();
      if (w.length > rec.writes.length) {
        addAnomaly(rec, `double-click sends ${w.length} writes, one click sent ${rec.writes.length}`);
      }
    }
  }
  log(rec);
}

async function inputProbes(it, rec) {
  rec.kind = 'input';
  rec.probes = [];
  for (const [label, value] of INPUTS) {
    ev = fresh();
    if (!(await mark(it.target))) break;
    const ok = await page
      .locator('[data-bh-t="1"]')
      .first()
      .fill(value, { timeout: 3000 })
      .then(() => true, () => false);
    if (!ok) {
      addAnomaly(rec, `cannot type into it (${label})`);
      break;
    }
    const st = await settle();
    rec.probes.push(label);
    judge(rec, st, `input ${label}`);
    await page.evaluate(() => { window.__bh_xss = 0; }).catch(() => {});
  }
  log(rec);
}

async function selectProbes(it, rec) {
  rec.kind = 'select';
  rec.probes = [];
  if (!(await mark(it.target))) return log(rec);
  const loc = page.locator('[data-bh-t="1"]').first();
  const values = await loc.evaluate((el) => [...el.options].map((o) => o.value)).catch(() => []);
  for (const v of values.slice(0, 10)) {
    ev = fresh();
    await loc.selectOption(v, { timeout: 3000 }).catch(() => {});
    const st = await settle();
    rec.probes.push(v);
    judge(rec, st, `select ${JSON.stringify(v)}`);
  }
  log(rec);
}

// Phone width: horizontal overflow and controls pushed off-screen.
async function screenCheck(screen, where) {
  screens.set(screen, screens.get(screen) ?? []);
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(300);
  const l = await listing();
  if (l.checks.overflowX) addAnomaly({ screen, repro: where }, 'page scrolls sideways at 390px');
  const off = l.controls.filter((x) => x.offscreen).map((x) => x.key);
  if (off.length) addAnomaly({ screen, repro: where }, `off-screen at 390px: ${off.slice(0, 5).join(', ')}`);
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(200);
}

function judge(rec, st, how) {
  const tag = ev.blocked.length ? ' (after a blocked write)' : '';
  for (const m of ev.console) addAnomaly(rec, `console error${tag}: ${m}`, how);
  for (const m of ev.pageErrors) addAnomaly(rec, `uncaught error${tag}: ${m}`, how);
  for (const r of ev.responses) {
    if (r.status >= 500) addAnomaly(rec, `HTTP ${r.status} ${r.method} ${pathOf(r.url)}`, how);
    else if (r.status >= 400) addAnomaly(rec, `UI got HTTP ${r.status} ${r.method} ${pathOf(r.url)}`, how);
  }
  for (const m of ev.native) addAnomaly(rec, `native browser dialog: ${m}`, how);
  if (st.busy) addAnomaly(rec, 'still busy (spinner / aria-busy) after 5s', how);
  if (st.xss) addAnomaly(rec, 'typed markup ran as HTML (window.__bh_xss set)', how);
  if (st.overflowX) addAnomaly(rec, 'page scrolls sideways at 1280px', how);
  for (const t of st.bad) addAnomaly(rec, `odd text on screen: "${t}"`, how, true);
  for (const t of st.wrongScript) addAnomaly(rec, `text not in ${args.script}: "${t}"`, how, true);
}

// Text findings are keyed by the text alone: the same string on five screens is one anomaly.
function addAnomaly(rec, reason, how, anyScreen = false) {
  if (targets && rec.inScope === false) return;
  const key = anyScreen ? reason : `${rec.screen} ${reason}`;
  const a = anomalies.get(key);
  if (a) a.count++;
  else anomalies.set(key, { reason, screen: rec.screen, repro: rec.repro, how, step: rec.i, count: 1 });
  (rec.anomalies ??= []).push(how ? `${how}: ${reason}` : reason);
}

// --- browser helpers --------------------------------------------------------------------------

async function reach(path) {
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await settle();
  for (const step of path) {
    if (!(await act(step, 'click'))) return false;
    await settle();
  }
  return true;
}

async function settle() {
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
  const t0 = Date.now();
  let c = await checks();
  while (c.busy && Date.now() - t0 < 5000) {
    await page.waitForTimeout(500);
    c = await checks();
  }
  return c;
}

async function checks() {
  for (let i = 0; i < 3; i++) {
    try {
      return await page.evaluate(pageFn, { op: 'checks', script: args.script ?? null });
    } catch {
      await page.waitForTimeout(300); // navigation in progress
    }
  }
  return { url: page.url(), busy: 0, dialogs: 0, overflowX: false, bad: [], wrongScript: [], xss: false };
}

async function listing() {
  const controls = await page.evaluate(pageFn, { op: 'list' }).catch(() => []);
  return { controls, checks: await checks() };
}

async function mark(t) {
  return page.evaluate(pageFn, { op: 'mark', key: t.key, n: t.n }).catch(() => false);
}

async function act(t, how) {
  if (!(await mark(t))) return false;
  const loc = page.locator('[data-bh-t="1"]').first();
  const opts = { timeout: 3000 };
  return (how === 'dblclick' ? loc.dblclick(opts) : loc.click(opts)).then(() => true, () => false);
}

// Runs inside the page. One function so page.evaluate can ship it whole.
function pageFn({ op, key, n, script }) {
  const SEL = [
    'button', 'a[href]', 'input:not([type=hidden])', 'textarea', 'select', '[contenteditable=""]',
    '[contenteditable=true]', '[role=button]', '[role=link]', '[role=menuitem]',
    '[role=menuitemcheckbox]', '[role=menuitemradio]', '[role=tab]', '[role=checkbox]',
    '[role=radio]', '[role=switch]', '[role=combobox]', '[role=slider]', '[role=option]',
    '[role=textbox]', '[role=searchbox]',
  ].join(',');
  const INPUT_ROLE = { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button',
    submit: 'button', reset: 'button', image: 'button', file: 'file', search: 'searchbox' };
  const TAG_ROLE = { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox' };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' &&
      !el.closest('[aria-hidden="true"],[inert]');
  };
  const roleOf = (el) =>
    el.getAttribute('role') ||
    (el.tagName === 'INPUT' ? INPUT_ROLE[el.type] || 'textbox' : null) ||
    (el.isContentEditable ? 'textbox' : null) ||
    TAG_ROLE[el.tagName] || el.tagName.toLowerCase();
  const nameOf = (el, role) => {
    const by = el.getAttribute('aria-labelledby');
    const typed = ['textbox', 'searchbox', 'combobox'].includes(role) || el.tagName === 'SELECT';
    const t =
      el.getAttribute('aria-label') ||
      (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ') : '') ||
      (el.labels?.[0]?.innerText ?? '') ||
      (typed ? el.getAttribute('placeholder') || '' : el.innerText) ||
      el.getAttribute('title') ||
      (['button', 'submit'].includes(el.type) ? el.value : '') ||
      el.querySelector('[aria-label]')?.getAttribute('aria-label') ||
      el.getAttribute('alt') || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 60);
  };

  if (op === 'checks') {
    const vis = (q) => [...document.querySelectorAll(q)].filter(visible).length;
    const texts = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = w.nextNode(); node && texts.length < 2000; node = w.nextNode()) {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      const p = node.parentElement;
      if (!t || !p || p.closest('script,style,code,pre,noscript') || !visible(p)) continue;
      if (!t.startsWith('BH ')) texts.push(t.slice(0, 80));
    }
    const odd = /\bundefined\b|\bNaN\b|\[object Object\]|^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*){1,3}$/;
    const own = script ? new RegExp(`\\p{Script=${script}}`, 'u') : null;
    const latin = /[A-Za-z]{3,}\W+[A-Za-z]{3,}/;
    return {
      url: location.href,
      busy: vis('[aria-busy="true"],[role="progressbar"],progress'),
      dialogs: vis('[role="dialog"],[role="alertdialog"],dialog[open]'),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      bad: texts.filter((t) => odd.test(t)).slice(0, 5),
      wrongScript: own ? texts.filter((t) => latin.test(t) && !own.test(t)).slice(0, 5) : [],
      xss: window.__bh_xss === 1,
    };
  }

  if (op === 'mark') document.querySelectorAll('[data-bh-t]').forEach((e) => e.removeAttribute('data-bh-t'));
  const counts = {};
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    const role = roleOf(el);
    const name = nameOf(el, role);
    const k = `${role} "${name}"`;
    const i = (counts[k] = (counts[k] ?? -1) + 1);
    if (op === 'mark') {
      if (k === key && i === n) {
        el.setAttribute('data-bh-t', '1');
        return true;
      }
      continue;
    }
    const r = el.getBoundingClientRect();
    out.push({
      key: k, n: i, role, name,
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      href: el.tagName === 'A' ? el.href : undefined,
      type: el.type || undefined,
      offscreen: r.right > innerWidth + 1 || r.left < -1,
    });
  }
  return op === 'mark' ? false : out;
}

// --- bookkeeping ------------------------------------------------------------------------------

function enqueue(controls, path, screen) {
  const list = screens.get(screen) ?? [];
  screens.set(screen, list);
  for (const c of controls) {
    const id = `${screen} › ${c.key}`;
    if (seen.has(id) || list.length >= 80) continue;
    seen.add(id);
    list.push(c.key);
    const item = { path, target: c, screen };
    const scoped = targets && targets.some((t) => repro(path, c).includes(t));
    if (scoped) queue.unshift(item);
    else queue.push(item);
  }
}

function diff(before, after) {
  const b = new Set(before.controls.map((c) => c.key));
  const a = new Set(after.controls.map((c) => c.key));
  return {
    urlChanged: before.checks.url !== after.checks.url ? after.checks.url : false,
    dialogsDelta: after.checks.dialogs - before.checks.dialogs,
    added: [...a].filter((k) => !b.has(k)),
    removed: [...b].filter((k) => !a.has(k)).length,
  };
}

function writes() {
  return ev.responses
    .filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method))
    .map((r) => `${r.method} ${pathOf(r.url)} ${r.status}`)
    .concat(ev.blocked.map((b) => `${b} (blocked)`));
}

function log(rec) {
  if (rec.opened) rec.opened.added = rec.opened.added.slice(0, 15);
  appendFileSync(logFile, JSON.stringify(rec) + '\n');
}

function report() {
  const inv = Object.fromEntries(screens);
  writeFileSync(join(outDir, 'inventory.json'), JSON.stringify(inv, null, 1));
  const nControls = [...screens.values()].reduce((s, l) => s + l.length, 0);
  console.log(
    `crawl: ${actions} actions, ${screens.size} screens, ${nControls} controls, ` +
      `${queue.length} not reached (max-actions ${maxActions}), ${anomalies.size} anomalies`,
  );
  let i = 0;
  for (const a of anomalies.values()) {
    const times = a.count > 1 ? ` [x${a.count}]` : '';
    console.log(`A${++i}${times} ${a.reason}\n   at ${a.repro}${a.how ? ` (${a.how})` : ''}${a.step ? ` — log #${a.step}` : ''}`);
  }
  if (noChange.length) {
    console.log(`no visible change after click (${noChange.length}): ${noChange.slice(0, 10).join(' | ')}`);
  }
  if (skipped.length) console.log(`not clicked (${skipped.length}): ${skipped.slice(0, 15).join(' | ')}`);
  console.log(`full log: ${logFile}`);
}

// --- small utils ------------------------------------------------------------------------------

function fresh() {
  return { console: [], pageErrors: [], responses: [], blocked: [], native: [], popups: [] };
}
function pick(c) {
  return { key: c.key, n: c.n };
}
function repro(path, c) {
  return [...path.map((p) => p.key), c.key].join(' › ');
}
function isTextInput(c) {
  return ['textbox', 'searchbox'].includes(c.role) ||
    (c.role === 'combobox' && c.type !== undefined && !c.type.startsWith('select'));
}
function screenOf(checks) {
  const u = new URL(checks.url);
  const idless = (s) => s.replace(/\/([0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{16,}|\d+)(?=\/|$)/gi, '/:id');
  return idless(u.pathname) + (u.hash ? idless(u.hash) : '') + (checks.dialogs ? ' [dialog]' : '');
}
function sameOrigin(href) {
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
}
function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? '?…' : '');
  } catch {
    return url;
  }
}
function loadChromium(dir) {
  const req = createRequire(join(resolve(dir), 'package.json'));
  for (const name of ['playwright', '@playwright/test']) {
    try {
      return req(name).chromium;
    } catch {
      // try the next package name
    }
  }
  die(`cannot load playwright from ${dir}; pass --pw <dir that has playwright installed>`);
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) die(`unexpected argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}
function die(msg) {
  console.error(`crawl: ${msg}`);
  process.exit(1);
}
