1. **Blockers**:
   - For each `#N` under the body's `## Blocked by` heading, check `gh api repos/{owner}/{repo}/issues/N --jq .state`.
   - If any is still open: add the `blocked` label to this issue and end your turn.

2. **Audit against `main`** (is it already done?):
   - Audit `origin/main` (the script fetched it). If `git rev-list --count origin/main..HEAD` is 0,
     the worktree **is** `main`: grep and run tests there. Otherwise read `main` without switching:
     `git grep <pattern> origin/main`, `git show origin/main:<path>`. For each acceptance
     criterion in the body, look for evidence on `main`: grep for the route / table / component /
     file it names, and find the test that covers it. Run only those test files if you need proof
     (not the whole suite).
   - If the criteria name more than ~3 things to locate, delegate the search to one
     `caveman:cavecrew-investigator` Agent (pass it the criteria list, ask for a `file:line`
     table per criterion, code and covering test). Its compressed answer replaces your own greps
     and file dumps. Afterwards, read only the files you will actually change.
   - A code criterion is **met** only if the code exists *and* a test covers it. A doc criterion
     (ADR, README, explainer) is met if the file has that content.
   - Write the verdict to the progress file, one line per criterion: `met: <file:line / test>` or
     `missing: <what's lacking>`.
   - **All met** → check every box (step 9), close the issue (comment
     "Already on main: <evidence per criterion>", then PATCH `state=closed`),
     unblock dependents (step 11), set `step: done`. Finished — no branch, no PR.
   - **Some met** → check those boxes now (step 9). The rest of the run covers only the
     `missing` criteria.
   - Browser checks go to the `e2e` agent (see "Human-only work → split out"). A
     criterion that needs hosted config, secrets or product sign-off → apply that rule.
   - **Only struck items remain** (all other criteria met, rest already split out) → close the
     issue (comment "Done; human-only items moved to #M", then PATCH `state=closed`),
     unblock dependents (step 11), set `step: done`. No branch, no PR.

3. **Branch Setup**:
   - Done by the script. Confirm `git branch --show-current` prints `feature/issue-<ISSUE_NUMBER>`;
     if not, go to "If blocked". Don't create or switch branches.

4. **Planning Phase**:
   - Don't load `/druri-plan` into your own context (it's large and would ride along on every
     later turn). Spawn one `general-purpose` Agent with this prompt: *"Run the `/druri-plan`
     skill for Issue #<ISSUE_NUMBER>, scoped to these missing criteria: <list>. Conventions
     already known: <what you learned in step 2>. Write the plan to
     `logs/issue-<ISSUE_NUMBER>.plan.md` (max ~40 lines: each file to create/touch, what changes
     in it, which tests cover it). Reply only `done`."* Then read that plan file and follow it.
   - **Skip this step** if the missing criteria touch at most 2 files and need no new migration,
     route or shared schema. Note `plan: skipped (small)` in the progress file and go to step 5.

5. **TDD Phase**:
   - Run the `/mattpocock-skills:tdd` skill: write failing tests covering the missing criteria,
     then write the code until they pass (red → green → refactor).
   - While coding, run the single test file you're working on (not the whole suite) — step 6
     runs the related tests once. Use the dot reporter and cap the output:
     `pnpm --filter <pkg> exec vitest run <file> --reporter=dot 2>&1 | tail -30`. Only if that
     shows a failure you can't read, re-run that one file with `--reporter=verbose | tail -80`. Don't run the full typecheck after each edit; step 6 runs it once.
   - Work in batches: read all the files you need in one go, write the related test and code
     files together, then run the tests — not one file per turn.
   - (This replaces `/mattpocock-skills:implement`, which only a human can invoke.)

6. **Local Checks**:
   - From the repo root run `scripts/ralph-checks.sh` and fix everything until green. It runs lint,
     typecheck, and only the tests related to files changed against `origin/main` (per package).
     CI runs the full suite before the merge, so do not run `pnpm test` / `pnpm -r test` yourself.
   - Lint and typecheck run once per session: the Stop hook skips its re-check in ralph runs.

7. **PR Creation**:
   - Commit changes, push the branch to GitHub, and open a Pull Request targeting `main`.
   - Browser checks: for a UI change or a browser criterion, spawn the `e2e` agent with the criteria and
     the worktree path before opening the PR; its verdict lines and screenshot paths go in the PR body.
     On `fail`, fix the product bug and re-run it; only `E2E_RESULT: setup-failed` splits the check.
   - Set the PR body to include `Closes #<ISSUE_NUMBER>`. If you split out human-only work, the
     body also names each follow-up issue (`Human-only items moved to #M`).
