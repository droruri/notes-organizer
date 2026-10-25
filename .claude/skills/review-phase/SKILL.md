---
name: review-phase
description: Run the ralph review phase on the open PR for one GitHub issue — Standards and Spec reviewers in parallel, each finding checked against the code, real ones fixed, checks re-run, issue checklist updated. Use when the user says "review phase for issue N" or types /review-phase N.
argument-hint: <issue-number>
disable-model-invocation: true
---

# Review phase for issue #$ARGUMENTS

If `$ARGUMENTS` is not a single issue number, stop and ask for one.

1. **Load the spec.** Run `gh issue view $ARGUMENTS --json title,body`. The body is the spec and
   the scope. Then read `ralph/shared.md` and `ralph/review.md` and execute **PHASE `review`** (steps 0, 8, 9,
   the progress file, "If blocked") exactly as written there, with the changes below.

2. **Find the PR** (step 0): `gh pr list --state open --head feature/issue-$ARGUMENTS --json number,url`.
   No open PR → stop and say so; this skill reviews, it doesn't build. Check out the PR branch
   and `git pull`.

3. **Always run both reviewers** — this skill is an explicit request for a full review, so skip
   step 8's "under ~150 lines" shortcut. Launch two `caveman:cavecrew-reviewer` Agents **in one
   message** (parallel). Give each:
   - the issue number, title and acceptance criteria (copy them from the body, don't paraphrase);
   - the diff command `git diff main...HEAD -- . ':!pnpm-lock.yaml'` (not the diff itself);
   - its axis: **Standards** (conventions in `CLAUDE.md`) or **Spec** (does the diff meet every
     acceptance criterion; name any criterion with no code or no test);
   - the limits from step 8: run the diff command once, open other files only to confirm a
     suspected finding, at most ~10 tool calls, one line per finding;
   - the required header: its reply must start with `issue #$ARGUMENTS` and the output of
     `git diff --stat main...HEAD -- . ':!pnpm-lock.yaml'`.

4. **Check the reviewers looked at the right thing** (step 8 guard). Compare each header with
   `git diff --name-only main...HEAD -- . ':!pnpm-lock.yaml'`. Wrong issue or files outside the
   diff → discard that reviewer's output and re-run it once. Second mismatch → "If blocked".

5. **Verify every finding before acting.** Open the cited lines and decide:
   - `fix` — real defect or real convention breach. Fix it.
   - `false positive` — say why in one line (the code already handles it, the reviewer misread …).
   - `skip` — valid nit not worth the churn. Say why in one line.

   Never fix something you haven't confirmed in the code.

6. **Re-check and push.** After fixes, run step 6 of `ralph/build.md` from the repo root
   until green, commit, push.

6a. **Browser check** — only if the diff touches `apps/web/`. Start the app, open the changed
   page in the built-in browser, and walk each UI acceptance criterion. Prefer `read_page` /
   `get_page_text` over screenshots (cheaper). Record pass/fail per criterion. A failed
   criterion is a finding with verdict `fix`.

6b. **Failing CI or E2E is a blocker, not a footnote.** If `gh pr checks` shows a red check,
   read the shortest decisive log line and fix it. If the failure is unrelated to this PR, say
   so with evidence (same check red on `main`) — never report the review as passed while a
   check is red without that evidence.

7. **Checklist and progress** (step 9 and the progress file). Tick the criteria that are now met
   in the issue body. Set the progress file to `next: step 10` with the findings summary.

8. **Report** to the user: PR link, a table of findings (reviewer, `file:line`, verdict, one-line
   reason), check results, and the next step (merge phase, step 10). Don't merge — that belongs
   to the merge phase.
