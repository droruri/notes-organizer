# Logging

How the API logs. Helpers live in `apps/api/src/requestLog.ts`; fields and examples below are
copied from the merged code.

## 1. What logs for free

- Fastify's request start/end lines (`incoming request`, `request completed`) with `reqId`,
  status and response time. The query string is stripped (`withoutQueryInRequestLog`).
- `userId` on every later line of an authenticated request (`addLogFields(req, { userId })` in
  `auth.ts`); a bad token logs `access token rejected` (`warn`).
- `request rejected` (`info`, `{ status, error }`) for every 4xx/5xx JSON body with an `error`.
- The AI decorator `withLogging` (`ai/provider.ts`): `ai extract start/end/failed`,
  `chat finished`, `chat stream failed`, `transcription start/end/failed`.
- The link reader decorator `withLinkLogging` (`domain/links/preview.ts`): `link preview
  start/end`, `link unreachable`, `links read start`, `links read`.

## 2. What each feature adds

For every domain entry function a route calls:

- wrap it in `timed(name, fields, fn)` — `debug` `<name> start` / `<name> end` with `ms`, and
  `error` `<name> failed` with `err` and `ms` before rethrowing;
- log one `info` outcome line with ids and counts;
- log a `warn` for every failure it catches and turns into a fallback, `null` or
  `{ ok: false }`. **A swallowed error without a `warn` is a bug.**

```ts
return timed('createDraft', {}, async () => {
  const draft = await createDraftUntimed(db, ai, links, userId, input, audio);
  if (draft.created) {
    log().info({ noteId: draft.note.id, links: extractLinks(input.body).length }, 'draft saved');
  } else {
    log().info({ noteId: draft.note.id }, 'draft duplicate');
  }
  return draft;
});
```

```ts
if (result.ok) log().info(result.value.created, 'import confirmed');
else log().warn({ error: result.error }, 'import rejected');
```

Use `log()` — the current request's logger (silent outside a request, so unit tests need no
setup). Never take a logger as a parameter and never call `console.*` (except at startup, before
the app exists; use `app.log` there once it does).

## 3. Levels

- `debug` — start/end lines (`timed()`, decorators).
- `info` — outcomes.
- `warn` — swallowed failures.
- `error` — thrown errors (`timed()` does this).

`LOG_LEVEL` (default `info`) sets the threshold.

## 4. Never log

Note bodies, prompts, transcripts, chat messages, tokens, emails, full URLs. Log ids, counts,
lengths, durations, failure codes and hostnames (`hostOf(url)`). For caught errors use
`errorSummary(err)` (name and code only) as `err`: messages and stacks can echo note text.

## 5. Style

Short lowercase past-tense message (`draft saved`, `import rejected`); data in the object, never
interpolated into the message. Reuse the field names: `noteId`, `userId`, `ms`, `count`, `error`
(a domain error code), `err` (`errorSummary` of a caught exception), `host`.

## 6. New port or external service

Give it a logging decorator in its own file, like `withLogging` and `withLinkLogging`, and apply
it once in `buildServer` (`const links = withLinkLogging(rawLinks)`). Domain code then gets
logging without knowing about it.

## 7. Testing logs

Build the server with `logger: { level: 'debug', stream }` and collect the JSON lines;
`captureLogs({ db })` in `src/test-logs.ts` does this. Assert the outcome line and the failure
`warn`:

```ts
expect(lines.find((l) => l.msg === 'draft duplicate')).toMatchObject({ noteId });
```

Privacy test: put a secret in the input and assert it never reaches any line.

```ts
expect(JSON.stringify(lines)).not.toContain(SECRET);
```

See `requestLog.test.ts` for both patterns.

## 8. Reading logs locally

```sh
LOG_LEVEL=debug pnpm dev
```

Every line of one request shares a `reqId`; filter by it (e.g. `| grep <reqId>`) to follow a
request from `incoming request` to `request completed`.
