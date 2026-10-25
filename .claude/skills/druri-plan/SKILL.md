---
name: druri-plan
description: Dror's personal guardrails for how to plan and execute any coding ticket — enforce minimal file footprint, reuse over reinvention, runtime-error safety, and code that lives in its correct file. Use this whenever you are about to write an implementation plan, scope a change, decide which files to create or touch, or start coding a ticket/task/bug fix. Trigger on phrases like "plan this", "how should we build X", "let's implement", "scope this ticket", or any time you catch yourself about to create new files, write a new utility from scratch, or decide where a piece of logic should live. Apply it BEFORE presenting a plan and AGAIN before each edit, even if the user did not explicitly name it.
---

# Dror's Planning & Execution Guide

These are Dror's standing preferences for how any plan and any execution should be shaped. They apply on top of the project's CLAUDE.md and any skill-specific workflow (brainstorming, writing-plans, TDD). Treat them as a lens you run every plan and every edit through — not a one-time checklist.

The goal of all of these rules is the same: **deliver exactly what the ticket needs, built on what already exists, and nothing more.** Smaller surface area and reused patterns mean less to review, less to break, less to maintain, and a change that a reviewer can fully understand in one sitting.

---

## 1. Minimalism — the smallest change that achieves the ticket's goal

The plan and the execution must touch the **minimum number of files** needed to satisfy the ticket. Every new file and every modified file is a cost: more to review, more to test, more surface for bugs, more for a future reader to hold in their head. Justify each one against the ticket's actual goal.

**How to apply this:**

- **Start from the ticket's goal, not from an ideal architecture.** Implement only what the current requirements demand. No "while I'm here" cleanups, no speculative abstractions, no parameters or config "just in case" (YAGNI).
- **Prefer editing an existing file over creating a new one.** A new file is justified only when it carries a genuinely distinct responsibility that does not belong in any existing file. If the logic naturally extends something that already exists, extend it.
- **Count the files before presenting the plan.** State the file list explicitly in the plan (created vs. modified) and, for each, one line on why it is unavoidable. If the list feels long, go back and look for files that can be merged, dropped, or replaced by editing existing code.
- **Resist scope creep mid-execution.** If a refactor, rename, or "quick improvement" tempts you while coding, stop. If it is genuinely valuable but out of scope, flag it separately (a follow-up task) rather than folding it into this change.
- **Smallest diff that is still clean.** Minimalism means fewest files and lines — never at the cost of readability or correctness. Do not cram unrelated logic into one file just to lower the file count. The aim is the smallest change that a reviewer can fully understand, not the smallest change by raw line count.

**Before presenting any plan, ask yourself:**

- Can this be done by editing existing files instead of adding new ones?
- Is every file in this list doing work the ticket actually requires?
- What is the single smallest version of this change that still solves the problem?

**Before each edit, ask yourself:**

- Am I about to create a file? Could this live in an existing one?
- Is this line/parameter/branch required by the ticket, or am I adding it "just in case"?

---

## 2. Don't reinvent the wheel — reuse before you write

Before writing any new utility, component, hook, service, type, or pattern, **look for an existing implementation in the codebase to reuse or take inspiration from.** Most of what a ticket needs has usually been solved somewhere in the repo already. Duplicating it creates drift, inconsistency, and double the maintenance.

**How to apply this:**

- **Search first, write second.** Before authoring anything non-trivial, search the codebase for existing helpers, components, hooks, services, or patterns that do the same or similar thing. Use Grep/Glob, the wiki (`docs/wiki/`), and the project's documented conventions. In this repo specifically, the CLAUDE.md mandates consulting `docs/wiki/` + `docs/wiki/insights/` before feature work — that is also your first stop for finding the canonical implementation.
- **Reuse the established pattern even when you could write your own.** If the repo already has a way to validate request bodies, manage state, build a list screen, define a job, or scope a query, follow that pattern. Consistency with the existing codebase is worth more than a marginally cleaner bespoke solution. (See the project's "Architectural Deprecations" table — reusing the _right_ pattern also means not resurrecting a deprecated one.)
- **Take inspiration, then adapt — don't blind-copy.** When you find a similar implementation, model your code on it: same structure, naming, error handling, and conventions. Extract shared logic into a reusable utility rather than copy-pasting a block (DRY).
- **When you don't know, ASK — don't guess.** If you cannot find an existing implementation and you are unsure whether one exists or which pattern is canonical, **stop and ask Dror** before inventing a new approach. A short question ("Is there already a helper for X, or should I write one?") is far cheaper than building the wrong thing or creating a duplicate. Asking is the expected behavior here, not a failure.

**Before writing anything new, ask yourself:**

- Has someone already solved this in the repo? (Did I actually search, or just assume not?)
- Is there an established pattern for this kind of thing I should follow?
- If I genuinely can't find one and I'm unsure — have I asked Dror instead of guessing?

---

## 3. Don't Repeat Yourself — one source of truth for every piece of logic

This is the sharper, functional edge of rule 2. Rule 2 says "look before you build a new thing." This rule says: **the same behavior must live in exactly one place.** If a piece of logic — a calculation, a validation, a mapping, a formatting rule, a status check — already exists somewhere in the codebase, call it; do not write a second copy that does the same job.

Duplication is expensive in a way that is easy to underestimate. Two copies of the same logic drift apart the moment one is changed and the other is forgotten. A bug fixed in one is left alive in the other. A reader who finds one copy can't tell whether it's the authoritative one. Every duplicate doubles the maintenance and halves the trust.

**How to apply this:**

- **Reuse the existing function instead of re-deriving its result.** If a value can be obtained by calling something that already exists (a selector, a service method, a helper, a computed field), call it. Don't recompute the same thing inline because it was faster to type.
- **Extract on the second occurrence, not the third.** The moment you are about to write logic that you know already exists elsewhere — or that you'll need again two lines down — stop and reach for a shared function. If a suitable shared home doesn't exist, create one small, well-named utility and have both call sites use it. Two copies is already a smell, not a "wait until it's a pattern" situation.
- **Share the source of truth, not just the code.** DRY applies to constants, enums, types, status maps, and config too — not only functions. If the same magic string, threshold, or shape appears in two files, hoist it to one exported definition and import it. (In this repo, that often means a shared `dto`/types module or an existing constants file — reuse it rather than redeclaring.)
- **Prefer composing existing functions over re-implementing their internals.** If you need a slight variation of something that exists, wrap or compose it, or extend it via a parameter/strategy — don't fork a near-identical copy. (Open/Closed: extend behavior, don't clone-and-tweak.)
- **When the duplication is unavoidable, say why.** Sometimes two things look similar but are genuinely independent and will evolve separately — forcing them to share would be the wrong coupling. If you choose to keep them separate, note it briefly so a reviewer knows it was a decision, not an oversight. (Don't abstract things together just because they look alike today — that's the opposite failure.)

**Before writing any logic, ask yourself:**

- Does this exact behavior already exist somewhere I can call instead of rewriting?
- Am I about to type a calculation/constant/check that lives in another file? Can I import it?
- If I need a variation, can I compose or parameterize the existing one rather than copy it?

---

## 4. Every file, class, and function must earn its place

This is rule 1 taken down to the level of individual units. Rule 1 keeps the **file** count minimal; this rule keeps the **abstraction** count minimal. The aim is to avoid the slow accumulation of tons of code where each piece seemed reasonable but the whole is far larger than the ticket needed.

Each new file, class, function, hook, interface, or type is a thing a future reader has to discover, understand, and keep working. An abstraction that exists "for structure" but is only used once, a wrapper that only forwards a call, a class that holds no state and could be a function, a parameter no caller ever varies — these are pure cost with no payoff. The default is **fewer, larger-purpose units**, each clearly pulling its weight.

**How to apply this:**

- **Justify each unit by a concrete, present need.** Before adding a function/class/file, name what in _this ticket_ requires it. "It might be reused later," "it's cleaner to separate," and "we'll probably need to extend it" are not present needs — that's YAGNI. Add the abstraction when the second real caller arrives, not in anticipation of it.
- **Don't add a layer that only passes data through.** A function that just calls another function, a class that just wraps a single utility, a service that only forwards to a repository — collapse it. Indirection is only worth it when it removes duplication, hides genuine complexity, or marks a real boundary.
- **Inline the single-use abstraction.** If a helper is called from exactly one place and isn't aiding testability or readability, consider folding it back into its caller. One well-named local block can be clearer than a function that forces the reader to jump elsewhere. (This is a judgment call — extract when it clarifies, inline when the extraction was premature.)
- **Prefer a function to a class unless you need state or polymorphism.** Don't introduce a class, interface, or inheritance hierarchy to hold logic that a plain function (or a couple of composed functions) handles. Composition over inheritance; the simplest construct that does the job.
- **No dead or speculative members.** No unused exports, no parameters no caller sets, no config flags nothing reads, no methods nothing invokes, no "v2" path that isn't wired up. If it isn't exercised by the ticket's actual behavior, it shouldn't ship.

**Before adding any file, class, or function, ask yourself:**

- What in _this ticket_ needs this unit to exist? (If the honest answer is "the future," don't add it.)
- Does this only forward to something else? Could the caller just call that thing directly?
- Is this used more than once? If not, does extracting it actually make the code clearer?
- Could a plain function replace this class? Could composition replace this inheritance?

---

## 5. Prevent runtime errors — make the type system catch bugs before production

Code that compiles is not code that is safe. The most painful failures are the ones that pass typecheck, pass review, and then throw at runtime in front of a real user — a `Cannot read properties of undefined (reading 'x')` on a nested property, a value that was `null` when the types swore it was an object, an array that came back empty. **The goal of this rule is that nothing the type system could have caught reaches production.** Every value that crosses a boundary (an API response, a DB document, route params, user input, a third-party payload) is a place where reality can disagree with the declared type, and that gap is where runtime crashes live.

The trap is trusting a type annotation as if it were a runtime guarantee. TypeScript types are erased at compile time — they describe what you _expect_, not what actually arrives. A field typed `Recipient` can be `undefined` at runtime if the API omitted it, the document was soft-deleted, or an enum value was added that your status map doesn't cover. Reaching into `recipient.profile.address.city` on such a value is exactly the nested-property crash that hit production. The fix is to treat the boundary as untrusted and prove the shape before you walk into it.

**How to apply this — emphasis on TypeScript:**

- **Never reach through a nested property you have not proven exists.** Before `a.b.c.d`, confirm each level. Use optional chaining (`a?.b?.c?.d`) when absence is legal, and pair it with a nullish-coalescing default (`?? fallback`) or an explicit guard when a missing value would otherwise propagate `undefined` into code that can't handle it. Optional chaining stops the crash; the default decides what happens instead — do both, don't just `?.` and hope.
- **Distrust every value at a boundary, regardless of its type.** API responses, DB reads, `JSON.parse`, route/query params, env vars, third-party SDK returns — these are `unknown` in spirit even when typed otherwise. Validate the shape at the edge (the repo's standard is **Zod** — `safeParse` the payload and handle the failure branch) so that everything downstream is genuinely the type it claims to be. A parsed-and-validated object is safe to dot into; a raw response is not.
- **Turn on the compiler's safety nets and respect them.** `strict` (with `strictNullChecks`) makes `undefined`/`null` show up in the types so the compiler forces you to handle them — don't defeat it. **Never use the non-null assertion `!`** to silence "possibly undefined"; that just moves the crash to runtime. Narrow with a real check (`if (!recipient) { … }`, a type guard, an early return) instead. Same for `as` casts that lie about the shape — a cast is a promise to the compiler that you might be breaking.
- **Handle the empty, the missing, and the unmatched case explicitly.** Empty arrays (`[]` → `.find()` returns `undefined` → don't chain off it), missing map keys, statuses with no mapping, the `default` branch of a `switch`. These are the silent-crash classics. When you map a status/enum to UI or behavior, make sure an _unexpected_ value has a defined outcome (a safe fallback or a thrown, logged error) rather than falling through to `undefined`. (This is the class of bug that produced Dror's last production incident — an unmapped value walked straight into a property access.)
- **Fail loud at the edge, not silent in the middle.** When a boundary value is invalid, catch it there with a clear, logged error (per CLAUDE.md's "handle errors explicitly" rule) — don't let a bad value flow three layers deep and crash somewhere unrelated where the stack trace tells you nothing. A guard at the source with a meaningful message beats a mysterious `undefined` deref later.
- **Prefer types that make the bad state unrepresentable.** Where it's cheap, model optionality and variants in the type (discriminated unions, `T | undefined` over a lying non-optional field) so the compiler _forces_ the handling instead of leaving it to discipline. The best runtime guard is the one the type system won't let you forget.

**Before writing or editing any property access or boundary read, ask yourself:**

- Am I about to dot into a nested property? Have I proven every level exists, or do I need `?.` + a default / a guard?
- Is this value coming from a boundary (API/DB/params/parse/third-party)? Have I validated its shape rather than trusting its declared type?
- Am I using `!` or `as` to silence the compiler? What's the real narrowing check I should write instead?
- Empty array, missing key, unmatched status, `default` case — is each one handled with a defined outcome?

---

## 6. Context is king — every piece of logic lives in the file it belongs to

Code is not just _what_ runs; it's _where it lives_. A function placed in the wrong file is a future bug even when it works today, because the next person looking for that logic won't find it where they expect, and the next person editing the file it's squatting in has to wade past concerns that have nothing to do with their task. **The goal of this rule is that the location of every function, type, and constant matches its responsibility** — so a reader can predict where something lives from what it does, and can open a file confident that everything inside it is about one thing.

The classic violation is logic that drifts into a file because that's where the author happened to be working. Treasury/payment logic written inside a **jobs definitions file** is the canonical example: the job definition's responsibility is _scheduling and wiring_ — declaring that a job exists, its queue, its concurrency, its trigger. The actual treasury computation (how a payout is calculated, validated, settled) is a _domain_ concern that belongs in the treasury module/service. When the two are mashed together, the job file becomes a dumping ground, the treasury logic becomes invisible to anyone searching the treasury folder, it can't be reused or unit-tested on its own, and a change to scheduling and a change to treasury rules now collide in the same file. Same shape for: business rules inside a controller/route handler, formatting logic inside a component that fetches data, a DB query inside a UI file, a validation rule inside a mapper.

**How to apply this:**

- **Name the responsibility, then pick the file from the responsibility — not from where you're already typing.** Before writing a function, ask "what concern is this?" (scheduling? treasury domain? validation? formatting? persistence?) and put it in the file/module that owns that concern. If you're in the jobs file and about to write treasury logic, that's the signal to stop and move to the treasury module — the job should _call_ it, not _contain_ it.
- **A file should have one reason to change (Single Responsibility at the file level).** If you can't describe what a file contains without "and" — "this is the jobs file _and_ it has the payout math" — the second thing is in the wrong place. Wiring files wire; domain files hold domain logic; the wiring calls into the domain.
- **Keep orchestration thin and push logic down.** Job definitions, controllers, route handlers, and event listeners are _entry points_ — they should marshal inputs and delegate to a domain function, not implement the rules themselves. The deeper logic lives in a focused module that knows nothing about how it was triggered.
- **Follow the repo's existing home for that concern.** This is where rule 6 meets rule 2: there is almost always already a folder/module for treasury, for payments, for workflows, etc. Put the logic _there_, next to its siblings, in the file-organization pattern the repo uses (`<name>.ts` impl, `<name>.types.ts`, `<name>.utils.ts` — see the project's file-organization convention). Don't invent a new home for logic that has an obvious existing one.
- **If the right file doesn't exist yet, create the right one — don't borrow the wrong one.** Needing a new home for a genuinely new concern is a valid reason to add a file (rule 1 still applies — only if no existing file fits). Borrowing an unrelated file because it's open is never the answer.
- **Colocate by feature/domain, not by happenstance.** Related code (the function, its types, its test) belongs together in the feature's directory. Logic ends up discoverable when its location is predictable from its purpose.

**Before writing any function/type/constant, ask yourself:**

- What single concern is this? Does the file I'm about to put it in own that concern, or am I just already here?
- Am I writing domain logic inside an entry point (job def, controller, handler, component)? Should this be delegated to the domain module instead?
- Would someone searching for this logic look in this file? If they'd look in the treasury folder, it belongs in the treasury folder.
- Does this file still have one reason to change after I add this, or did I just give it a second job?

---

## Putting it together

When you produce a plan, make all six rules visible in it:

1. **File list** — created vs. modified, each justified in one line. Smallest viable set (rule 1).
2. **Reuse notes** — for each new piece of logic, name the existing implementation or pattern it builds on, or explicitly flag "no existing equivalent found — confirm with Dror before writing from scratch" (rule 2).
3. **No-duplication check** — confirm no behavior/constant/type you're adding already lives elsewhere; if it does, you call it rather than copy it (rule 3).
4. **Abstraction budget** — for each new class/function/layer, one line on the present need it serves; drop anything justified only by "the future" (rule 4).
5. **Safety check** — name the boundaries the change reads from (API/DB/params/parse) and the nested accesses or status maps it adds, and how each is guarded (validated shape, `?.` + default, narrowing, handled empty/unmatched case) so nothing the type system could catch reaches production (rule 5).
6. **Placement check** — for each new piece of logic, name the concern it belongs to and confirm it's going in that concern's file/module (domain logic in the domain, not in a job/controller/component), so location is predictable from purpose (rule 6).

Then carry the same discipline into execution: every time you reach for a new file, a new utility, a copied block of logic, a new abstraction, a property access on a boundary value, or a place to drop a piece of logic, re-run the relevant questions above before doing it. The six rules reinforce each other — fewest files, built on existing code, no logic written twice, no unit that isn't needed, nothing that can crash at runtime where the compiler could have stopped it, and every piece of code living in the file its responsibility dictates — and together they keep the change as small, as familiar to a reviewer, as safe in production, and as easy to navigate as it can be.
