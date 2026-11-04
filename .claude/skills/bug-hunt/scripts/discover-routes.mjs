#!/usr/bin/env node
// Lists HTTP routes found in source code. App-agnostic.
//
//   node discover-routes.mjs [path ...]     (default: current directory)
//
// Prints one JSON object per line: {"method","path","file","line","kind"}.
// kind: "registration" (app.get('/x'), router.post(...), fastify.route({...}))
//       "nextjs"       (app/api/**/route.ts exports, pages/api/**)
//       "api-literal"  (any "/api/..." string, e.g. a client fetch)
// Skips node_modules, build output, and test files.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.turbo', '.vite',
  'test-results', 'playwright-report', 'android', 'ios', '.ralph', 'logs',
]);
const EXT = /\.(m?[jt]sx?|cjs|cts)$/;
const TEST = /\.(test|spec|e2e)\.[cm]?[jt]sx?$/;
const METHODS = 'get|post|put|patch|delete|head|options|all';

const registration = new RegExp(
  String.raw`\b[\w$]+\.(${METHODS})\(\s*(['"\x60])(\/[^'"\x60]*)\2`,
  'gi',
);
const routeObject = new RegExp(
  String.raw`method\s*:\s*\[?\s*['"](${METHODS})['"][\s\S]{0,200}?url\s*:\s*['"](\/[^'"]*)['"]`,
  'gi',
);
const apiLiteral = /(['"`])(\/api\/[^'"`\s]*)\1/g;
const nextExport = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

function* walk(path) {
  let st;
  try {
    st = statSync(path);
  } catch {
    process.stderr.write(`discover-routes: no such path ${path}\n`);
    return;
  }
  if (st.isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name)) continue;
    yield* walk(join(path, name));
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const seen = new Set();
function emit(r) {
  const key = `${r.method} ${r.path} ${r.file}:${r.line}`;
  if (seen.has(key)) return;
  seen.add(key);
  process.stdout.write(JSON.stringify(r) + '\n');
}

function nextPath(file) {
  const parts = file.split(sep);
  const appIdx = parts.lastIndexOf('app');
  if (appIdx >= 0 && /^route\.[cm]?[jt]s$/.test(parts.at(-1) ?? '')) {
    return '/' + parts.slice(appIdx + 1, -1).filter((p) => !/^\(.*\)$/.test(p)).join('/');
  }
  const pagesIdx = parts.lastIndexOf('pages');
  if (pagesIdx >= 0 && parts[pagesIdx + 1] === 'api') {
    return '/' + parts.slice(pagesIdx + 1).join('/').replace(EXT, '').replace(/\/index$/, '');
  }
  return null;
}

const roots = process.argv.slice(2);
for (const root of roots.length ? roots : ['.']) {
  for (const abs of walk(root)) {
    if (!EXT.test(abs) || TEST.test(abs)) continue;
    const file = relative(process.cwd(), abs);
    const text = readFileSync(abs, 'utf8');

    for (const m of text.matchAll(registration)) {
      emit({ method: m[1].toUpperCase(), path: m[3], file, line: lineOf(text, m.index), kind: 'registration' });
    }
    for (const m of text.matchAll(routeObject)) {
      emit({ method: m[1].toUpperCase(), path: m[2], file, line: lineOf(text, m.index), kind: 'registration' });
    }
    const np = nextPath(abs);
    if (np) {
      const exported = [...text.matchAll(nextExport)];
      for (const m of exported) emit({ method: m[1], path: np, file, line: lineOf(text, m.index), kind: 'nextjs' });
      if (!exported.length) emit({ method: 'ANY', path: np, file, line: 1, kind: 'nextjs' });
    }
    for (const m of text.matchAll(apiLiteral)) {
      emit({ method: 'ANY', path: m[2], file, line: lineOf(text, m.index), kind: 'api-literal' });
    }
  }
}
