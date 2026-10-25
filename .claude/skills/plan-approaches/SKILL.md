---
name: plan-approaches
description: Before committing to an implementation plan, generate about ten genuinely different approaches, score them against the same criteria, stress-test the top three, pick one, and write an "Approaches considered" section into the plan that says why the winner beat each alternative. Use for every implementation plan (plan mode or a "plan X" request), after exploring the code and before writing the plan's design, or when the user types /plan-approaches [plan-file] or asks to "compare approaches / options" for a change.
argument-hint: "[path-to-plan.md or short task description]"
---

# Plan approaches: `$ARGUMENTS`

The first idea is rarely the best one. This skill forces a wide search, a fair comparison, and a
written reason for the choice. The output is one section in the plan; the plan's design then
follows the chosen approach.

## 1. Frame the problem

- `$ARGUMENTS` names a plan file → read it; its goal is the problem. Otherwise → the task in this
  conversation.
- Explore first. Read the code paths the change touches, the relevant `docs/plan.md` section, and
  any existing helper, route, schema or component that already does part of the job. Approaches
  invented without this are guesses.
- Write down, in 3–6 bullets: the goal, the hard constraints (CLAUDE.md rules, schema, RLS,
  backward-compatible migrations, Hebrew RTL UI, no LLM calls in tests…), and what "done" looks
  like. Every approach is judged against this list.

## 2. Generate about ten approaches

Aim for ten. Each must be a design a competent engineer could defend — no strawmen added to make
the winner look good. If the problem honestly has fewer real options, list the real ones (at least
four) and say so; never pad.

Make them differ in **kind**, not in detail. Pull from these axes until you have enough:

- **Do nothing / reuse** — the behavior already exists, or an existing feature covers it.
- **Layer** — where the logic lives: DB (constraint, view, SQL function), API domain module, route,
  shared schema in `@notes/shared`, web feature, build/CI script.
- **Platform vs. own code** — native browser/Postgres/Fastify/Zod feature, installed dependency,
  new dependency, hand-written.
- **Data shape** — new table vs. new column vs. JSON field vs. derived at read time.
- **Timing** — compute on write, on read, in a background job, at build time.
- **Scope** — narrowest fix for the stated case vs. general mechanism.
- **Refactor first** — reshape the existing module so the change becomes small.
- **UX shape** (web) — inline vs. modal vs. separate page; optimistic vs. confirmed.

Give each approach a short name and 2–3 sentences: what it does and which files it touches.

## 3. Score all of them

Score every approach 1–5 on the same criteria (5 = best). Use these unless the problem needs others;
if you change them, say why.

| Criterion        | 5 means                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| Fit              | Uses existing layers and patterns; logic sits where CLAUDE.md says it goes |
| Footprint        | Fewest files and new concepts (`druri-plan` minimalism)                    |
| Correctness risk | Few edge cases, no race or data-loss path, boundaries parsed               |
| Testability      | Covered by plain Vitest / `app.inject()` / RTL tests, no new harness       |
| Reversibility    | Easy to roll back; migration is additive                                   |
| Lifecycle cost   | Cheap to run and maintain; no new service, dependency or config            |

Mark any approach that **breaks a hard constraint** as out, whatever its score, and say which
constraint. Don't total the scores blindly — they are a guide; the reasoning in step 5 decides.

## 4. Stress-test the top three

For each of the best three, check it against the real code, not memory:

- Open the files it would change. Does the seam it needs actually exist?
- Walk one concrete scenario end to end (a real user action or request with real values).
- Name its worst failure: what breaks, how you'd notice, how you'd recover.

Rescore if this turns anything up. It is normal for the order to change here.

## 5. Choose and explain

Pick one. It may be a combination of two approaches only if they fit together without extra glue;
say what you took from each.

Write the reason in terms of the problem, not the scores: "keeps the region lookup in the
normalizer, where it already runs on every save" beats "highest Fit score". For **every** rejected
approach, give one line on why it lost — the specific cost, risk or constraint, not "less
suitable".

## 6. Write it into the plan

Add this section to the plan, right after the problem statement and before the design. If there is
no plan file yet, put it at the top of the plan you are writing.

```markdown
## Approaches considered

**Problem:** <one sentence> **Constraints:** <the bullets from step 1, condensed>

| #   | Approach | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | -------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | <name>   | 4   | 5         | 4    | 5     | 5          | 5    | Chosen  |
| 2   | <name>   | …   | …         | …    | …     | …          | …    | Top 3   |
| 3   | <name>   | …   | …         | …    | …     | …          | …    | Out: <constraint> |

### Chosen: <name>

<2–4 sentences: what it is and why it wins. Mention what the stress test confirmed.>

### Why not the others

- **<name>** — <the one concrete reason it lost>
- …

### What would change the choice

<1–3 bullets: a fact that, if it turned out true, would make a different approach better. Omit if
none.>
```

Keep each approach's 2–3 sentence description out of the table; the table holds names and scores
only. Put the descriptions in a collapsed `<details>` block under the table if the reader needs
them.

The rest of the plan (design, tickets) follows the chosen approach. Don't hedge it with "or
alternatively…" — the alternatives live in this section.

## 7. Report

In chat: the chosen approach in one sentence, and the runner-up with the one reason it lost.
