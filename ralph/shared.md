# Ralph Task Execution Instructions

For the given GitHub Issue number, title, and body description, execute the steps below for
the **phase** named in your prompt. The prompt holds this shared part plus your phase's steps
(`ralph/build.md`, `ralph/review.md`, `ralph/merge.md`; `build` also gets the review steps 8-9 for
the small-diff case). Don't read the `ralph/` files: everything you need is in the prompt.

## Phases

`run-ralph.sh` runs each issue as three separate sessions, each starting with a fresh context,
inside the issue's own git worktree (`.ralph/wt/issue-<ISSUE_NUMBER>`, already on branch
`feature/issue-<ISSUE_NUMBER>`). Never `git checkout` or `git switch` another branch there: `main`
is checked out in the main tree. The progress file is the only hand-off between sessions, and is
mirrored to a GitHub issue comment so a run on another machine can resume, so keep it accurate.

`$RALPH_HOME` is the main checkout (the script sets it; it holds `scripts/ralph-*.sh`).

## Environment
- In cloud sessions use `gh api` REST; GraphQL is blocked. (HTTP 403; every `gh issue|pr <subcommand>` uses it.)
- Chromium: in claude.ai cloud sessions it is pre-installed at `/opt/pw-browsers` (Playwright configured for it). On the GitHub Actions runner the `ralph.yml` workflow installs it and starts the local Supabase stack. Either way, don't run `playwright install` yourself: `scripts/e2e-setup.sh` (run by the `e2e` agent) installs the browser if missing. Every browser check goes to the `e2e` agent (`.claude/agents/e2e.md`), in `build` and in `review`; don't run Playwright yourself.

`gh` below means REST: `gh api repos/{owner}/{repo}/...`. Shorthand used below (`R` = `repos/{owner}/{repo}`):

- issue: `gh api R/issues/N` (`.state`, `.labels[].name`, `.body`)
- labels: `gh api R/issues/N/labels -f 'labels[]=x'` (add), `gh api -X DELETE R/issues/N/labels/x` (remove)
- comment / close: `gh api R/issues/N/comments -f body=…`, `gh api -X PATCH R/issues/N -f state=closed`
- PR for the branch: `gh api "R/pulls?head=<owner>:<branch>&state=all"`
- CI: `gh api R/commits/<sha>/check-runs` (all `completed` and `conclusion` success/neutral/skipped = green)
- merge: `gh api -X PUT R/pulls/N/merge -f merge_method=squash`
- agents: use `caveman:cavecrew-reviewer` / `caveman:cavecrew-investigator`; if that type is not
  available (cloud sessions), use `general-purpose` with the same prompt.

| Phase    | Steps   | End your turn when                                                  |
| -------- | ------- | ------------------------------------------------------------------- |
| `build`  | 0 – 7 (+ 8, 9 if small) | the PR is open and the progress file says `next: step 8` (or `next: step 10` if you did the small review) |
| `review` (haiku) | 0, 8, 9 | review fixes are pushed, checklist updated, `next: step 10`         |
| `merge` (haiku)  | 0, 10, 11 | the issue is closed (`step: done`)                                |

The script merges green PRs itself (`scripts/ralph-merge.sh`). A `merge` session starts only when
that failed: CI is red, there is no open PR, or the merge was refused.

- Always start with step 0. If the progress file shows an **earlier** step unfinished (e.g. the
  previous phase died mid-way), finish it first, then do this phase's steps.
- **Run everything in the foreground, then end the phase.** Run tests, reviewers (sub-agents) and
  `git push` in the foreground and wait for them; never in the background (an ended turn restarts
  the session and reloads the whole context). Never poll or wait for CI (`gh pr checks --watch`,
  `gh api` loops) and never `sleep`: the script waits for CI and merges. Once the PR is pushed and
  the progress file is updated, end your turn. If a command fails because it wanted input (a
  credential prompt), do not retry it in a loop: report it under "If blocked".
- Do not start steps belonging to a later phase — end your turn so the next phase starts fresh.
- Exception: in `build`, after step 7 always size the diff (step 8). If it is **small**, do
  steps 8 and 9 in the same session and set `next: step 10` (not `next: step 8`); `run-ralph.sh`
  then skips the `review` phase. Stopping at `next: step 8` for a small diff wastes a whole
  review session.
- The issue closing early (step 2 "all met" or "only struck items remain") or "If blocked" ends
  every phase. Splitting out human-only work does **not** end a phase.

**The issue body is the spec and the scope.** Its acceptance criteria are the work; everything
else is derived from it. Read only the `docs/plan.md` sections the body names (e.g. *Auth*,
*Row Level Security*) and only the files/symbols its criteria point to. Don't explore beyond that.

0. **Resume Check** (always first):
   - If `logs/issue-<ISSUE_NUMBER>.progress.md` exists, read it (the script pulled it from the
     issue comment) — it says which step you stopped at, what's done, what's next, and decisions
     already made. Trust it over re-deriving.
   - Look up the PR: `gh api "repos/{owner}/{repo}/pulls?head=<owner>:feature/issue-<ISSUE_NUMBER>&state=all" --jq '.[] | {number, state, html_url}'`.
   - If an **open** PR exists: you are already on its branch. Continue from the `next:` line of the
     progress file (no progress file → read the PR's comments via `gh api repos/{owner}/{repo}/issues/<PR>/comments` to see what was done).
   - Otherwise (no PR, or only a merged one) go to step 1.

## Progress file

At the end of **every** step, overwrite `logs/issue-<ISSUE_NUMBER>.progress.md` (max ~20 lines)
and mirror it to the issue in the same Bash call:
`"$RALPH_HOME/scripts/ralph-progress.sh" push <ISSUE_NUMBER>`.

```
step: 8 (code review) — in progress
branch: feature/issue-<ISSUE_NUMBER>   PR: #41
audit: 3/5 met on main (checked); missing: onboarding test, RLS policy test
done: plan, tests (12 passing), local checks green, PR opened
review findings: 1 fixed (XSS in source_url), 1 open (rename fakeLlm → ...)
split: #92 (human-only items moved out, if any)
next: fix open finding, re-run pnpm lint/typecheck/test, push
decisions: chose X over Y because ...
```

Keep `decisions` to choices git can't show. When the issue is closed, set `step: done`.

## Human-only work → split out

Use this when a criterion truly needs a human: secrets/credentials you can't create, hosted
dashboard or account steps, subjective product sign-off. Do **not** label the current issue
`needs-human`; finish everything else and move the human part to its own issue. Apply it
whenever you meet such a criterion (step 2 audit or later), then carry on with the normal phases.

**Not human-only:** device, browser and visual checks. Hand them to the `e2e` agent
(`.claude/agents/e2e.md`): pass the criteria to verify (copied) and the worktree path. Spawn it like any agent; under
`/ralph-issue` that means the usual `AGENT_REQUEST type=e2e` relay. It runs `scripts/e2e-setup.sh` itself (reuses or starts the
Supabase stack, installs the Playwright browser, picks free ports), so a port clash or a missing
browser is no reason to split. It replies with `pass|fail` lines, screenshot paths and
`E2E_RESULT: pass|fail|setup-failed`. iOS simulator and computer-use checks for non-web stay yours.
- `pass`: put the verdict lines and screenshot paths in the PR (or the issue comment when closing).
- `fail`: a product bug. Fix it and re-run the agent. A `fail` is never a reason to split.
- `setup-failed` (in practice Docker isn't running): the only case where a browser check is split to
  `needs-human`. Paste the agent's failure line into the new issue.

**Tool-first check** before calling anything human-only. Look for something that can do the job:
tools, MCP servers and skills already in the session, a CLI (`gh`, `supabase`, `vercel`, …),
`SearchSkills` / `SearchPlugins`, the MCP registry (`search_mcp_registry`, `suggest_connectors`).

- **Tool available now** → use it and do the job. No split.
- **Tool exists but is not installed** → open a separate `needs-human` issue
  `Install <tool> so ralph can <do X>` with: what the tool is, why it is needed, exact
  install/auth steps, which original item it unlocks, and a last step "after install, close
  this issue; ralph then performs <X>". Strike the original line as
  `- [ ] ~~text~~ → needs <tool> (#K), then ralph does it`. Create the job as another issue with
  `## Blocked by #K`, **not** labeled `needs-human`, so the loop picks it up once #K is closed.
- **No tool exists** → human-only. Split as below.
- Search before you create (`gh api -X GET search/issues -f q="repo:$RALPH_REPO <title words> in:title"`) so a resumed
  phase opens no duplicates.

**Split:**

1. Refetch the body: `gh api repos/{owner}/{repo}/issues/<ISSUE_NUMBER> --jq .body > logs/issue-<ISSUE_NUMBER>.body.md`.
2. Strike each human-only checklist line, keeping it: `- [ ] ~~text~~ → moved to #M`.
3. Create the new issue **once**. First check the progress file for `split: #M` and
   `gh api -X GET search/issues -f q="repo:$RALPH_REPO Split from #<ISSUE_NUMBER> in:body"`; reuse a hit. Else
   `gh api repos/{owner}/{repo}/issues -f 'labels[]=needs-human' -f title="[needs-human] <parent title>: <short>" -F body=@<file>`.
4. Save the edited body: `gh api -X PATCH repos/{owner}/{repo}/issues/<ISSUE_NUMBER> -F body=@logs/issue-<ISSUE_NUMBER>.body.md`.
5. Record `split: #M` in the progress file.

New-issue body:

```
Split from #<ISSUE_NUMBER> (PR: <link, or "none yet">)

## Already done
<what ralph finished>

## To do (human)
- [ ] <item> — how to verify / next step: <exact command or click path>

## Why ralph couldn't do it
<reason; what was tried>
```

No `## Blocked by` section, and never add this issue to another issue's `## Blocked by`: it is
fully independent and the loop skips it by label. If the item really gates later work, say so in
the issue text so the human sees it.

**Parent completion:** the parent is done when every non-struck criterion is met; struck items
count as handled. Normal phases continue (PR, review, CI, merge, step 11). If only struck items
remain at the step 2 audit, close the parent as described there.

If creating the issue fails, fall back to "If blocked" below instead of dropping the human work.

## If blocked

If the **whole issue** is blocked and cannot be split (a decision only the user can make, a result
that contradicts `docs/plan.md`, CI failing for reasons outside this issue, a reviewer mismatch
twice), do **not** merge. Add the label `needs-human` to the issue, post a comment (on the PR if
there is one, else on the issue) with what is done and the exact next step, and end your turn.

## Keep context small (saves tokens)

- Prompts to phase agents and sub-agents point at sections, not whole files: name the
  `docs/plan.md` heading and the step numbers of this file they need.
- Read only the sections of `docs/plan.md` the issue body names (`grep -n "^##" docs/plan.md`, then
  `sed -n` the relevant range). Never read `docs/architecture.he.html` unless the issue is about it.
- Never read old session transcripts (`~/.claude/projects/**/*.jsonl`); use step 0 to resume.
- Exclude `pnpm-lock.yaml` from diffs: `git diff main...HEAD -- . ':!pnpm-lock.yaml'`.
- Pipe noisy output through `tail` (installs, test runs, CI logs) and chain related commands in
  one Bash call instead of many small ones.
- Budget: a `build` session should finish in about 20 turns. Past measurements put most of the
  cost in builds with 30+ turns, because each turn re-sends the whole context.
- **Batch tool calls — this is required, not a suggestion.** Every turn re-sends the whole
  context, so the number of turns is the main cost. Whenever you need several reads, greps or
  independent commands, issue them **all in one message** as parallel tool calls. A turn with a
  single Read followed by another single Read is a mistake.
- Read each file **once**. Don't re-read a file after editing it — the Edit succeeded or errored.
  Don't re-read a `docs/plan.md` section you already have; note what you need in the progress file.
