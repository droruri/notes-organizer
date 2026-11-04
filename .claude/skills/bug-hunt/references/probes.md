# Probe catalogue

`crawl.mjs` already runs the click, double-click, text-input, select and 390px probes, and
`api-fuzz.mjs` runs the auth, bad-id, bad-body, query-string and wrong-method probes. Use this
list for the probes that need judgement or state: undo, reload, second tab, leaving unsaved
text, uploads, field-level API bodies, and server-owned fields.

Pick every probe that fits the action. The point of each is in brackets — if you understand why
a probe exists, you will think of variants this list does not name.

## Buttons, links, menu items

- **Click once, then wait.** [Does anything tell the user it worked?]
- **Double-click / click 5 times fast.** [Duplicate submit, duplicate item, race between requests.]
- **Click while the previous request is still pending.** [Missing disabled state.]
- **Escape, browser back, and reload right after clicking.** [State lost, half-saved data, a
  dialog that comes back on reload, back button leaving the app.]
- **Click, then open the same thing in a second tab and change it there.** [Stale data, last
  write wins silently.]
- **Destructive actions (delete, remove, clear):** is there a confirmation or an undo? Does undo
  restore everything (attachments, tags, position)? Does the item vanish from every list and
  count, and stay gone after reload?
- **Keyboard only:** Tab to it, press Enter / Space. [Not focusable, no focus ring, Enter does
  something different from click.]

## Text inputs

- Empty, and whitespace only (`"   "`, a newline).
- One character.
- Very long: 5000 characters, and one 500-character word with no spaces (layout overflow).
- Emoji and combining characters: `👩🏽‍💻🇮🇱 é`.
- Mixed direction: Hebrew with English and numbers, `שלום hello 123 עולם`, and text starting
  with an English word in an RTL app.
- Markup and injection-looking text: `<b>x</b>`, `<img src=x onerror=alert(1)>`,
  `'; drop table notes; --`, `{{7*7}}`, `${7*7}`. [Rendered as HTML? Stored verbatim? Error?]
- Leading/trailing spaces. [Trimmed on save but not in the UI, or the other way round.]
- Paste instead of type (`browser_evaluate` to set value + dispatch `input`). [Handlers that only
  listen to key events.]
- Type, then leave without saving (close, back, reload). [Is the draft kept, or is the user
  warned?]
- URLs, emails, phone numbers in free text. [Link previews, auto-linking.]

## Selects, checkboxes, toggles, sliders

- Every option once, and the first and last option.
- Toggle on, off, on fast.
- Change, reload: did it persist?
- Change, then cancel the surrounding dialog: did it persist anyway?

## Files and uploads

- No file, an empty file, a large file, a wrong type (`.exe` renamed `.png`), a file name with
  spaces, Hebrew and emoji.
- Upload, then delete the parent item: is the file gone?

## Lists and navigation

- Empty state: what does a brand-new user see with nothing in the list?
- One item, then many (create 20 fast): order, scroll, counts.
- Search: empty query, no matches, a query with special characters, Hebrew final letters
  (ם ן ץ ף ך), case differences.
- Deep link: copy the URL of an inner screen, open it in a fresh tab. Unknown id in the URL.
- Browser back through every screen until you leave the app.

## Viewport and environment

- 390×844 (phone) and 1280×800 (desktop) with `browser_resize`, for every screen.
- Offline: `browser_evaluate` cannot toggle the network; if the profile gives an offline method,
  use it; otherwise skip and say so in coverage.
- Session: sign out (if the app has it) and press back; try the API with an expired or missing
  token.

## API routes

Call with `curl -sS -w '\n%{http_code}\n'` from Bash and the token from the profile. For each
route:

- **No auth header**, and a garbage token. [Expect 401, never data.]
- **Wrong method** on the same path. [404/405, not 500.]
- **Body:** missing entirely, `{}`, malformed JSON (`{"a":`), wrong content-type, an array
  instead of an object, `null`.
- **Each field:** missing, `null`, wrong type (number for string, string for number, object for
  array), empty string, 100 000 characters, negative number, `0`, float where int expected,
  unknown enum value.
- **Extra fields** the client must not set: `id`, `user_id`, `created_by`, `created_at`,
  `deleted_at`, `workspace_id` of another workspace. [Expect ignored or 400; a success that
  stores them is a bug.]
- **Path ids:** non-UUID (`abc`, `1`, `../`), a random valid UUID, an id that existed and was
  deleted. [Expect 400/404, never 500.]
- **Ownership:** if the profile gives a second test user, create something as user A and read,
  change and delete it as user B. [Expect 404, never success.]
- **Repeat:** the same create twice, the same delete twice, restore something not deleted.
- **Query strings:** missing required ones, repeated keys (`?q=a&q=b`), very long values.
- **Rate-limited routes** (the profile lists them): stop after the first 429 and record the
  limit; do not hammer, and never trigger a real LLM call.

Every response: status code fits the input, error body has no stack trace or SQL, and a
follow-up GET shows the stored state matches what the response claimed.
