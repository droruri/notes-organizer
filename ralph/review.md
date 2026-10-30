**Review scope (the `review` phase, run on the cheap model).** The phase relays reviewer
findings and fixes them. Nothing else. The `build` session, when it runs steps 8-9 itself, is
not bound by this block.
   - Allowed: spawn the reviewers, fix their findings, run step 6, push, flip the checklist, and
     spawn the `e2e` agent for browser checks (the only ad-hoc verification allowed).
   - Not allowed: running Playwright yourself or any other ad-hoc script (shell, node, python)
     written to verify behavior, edits to `ralph/*.md`, `run-ralph.sh`, `scripts/ralph-*.sh` or
     `.claude/skills/` (unless the issue itself is about the ralph loop), and work on anything the
     findings and acceptance criteria do not name.
   - A criterion that needs a browser check: spawn the `e2e` agent with the criterion and the
     worktree path. `pass` → flip its box and note the verdict in the progress file. `fail` → record
     it as a finding and fix it. `setup-failed` → split per "Human-only work" with the failure pasted in.
   - Turn budget: **25 turns**. Spawning the reviewers, fixing and pushing fit well inside it. At
     turn 20, stop adding fixes: push what passes step 6, record the unfixed findings in the
     progress file under `review findings:` (`open: …`), set `next: step 10`, and end your turn.

8. **Code Review Phase**:
   - Size the diff: `git diff --shortstat main...HEAD -- . ':!pnpm-lock.yaml'`.
   - **Small (under ~150 changed lines):** one `caveman:cavecrew-reviewer` Agent covering both
     axes (Standards = `CLAUDE.md` conventions, Spec = every acceptance criterion). In `build`, do
     this right after step 7 (see "Phases").
   - **Otherwise:** two `caveman:cavecrew-reviewer` Agents **in one message** (parallel), one
     Standards, one Spec. Spawn them directly — don't load `/mattpocock-skills:code-review` into
     your context; it would ride along on every later turn.
   - Give every reviewer: the issue number, the acceptance criteria (copied, not paraphrased), the
     diff command `git diff main...HEAD -- . ':!pnpm-lock.yaml'`, and these limits: *"Run the diff
     command once. Open another file only to confirm a finding you already suspect from the diff —
     no exploring. At most ~10 tool calls. One line per finding; none → `no findings`."*
   - Do **not** read the diff yourself (no `git diff` output, no diff file in `/tmp`). You only
     take in the findings, then open just the hunks you need to fix.
   - Guard against a reviewer reviewing the wrong thing: tell each reviewer to start its reply with
     `issue #<ISSUE_NUMBER>` and the file list from `git diff --stat main...HEAD -- . ':!pnpm-lock.yaml'`.
     Compare that list with `git diff --name-only main...HEAD -- . ':!pnpm-lock.yaml'` (names only,
     cheap). If it cites another issue or files outside the diff, discard its output and re-run it
     once; a second mismatch → "If blocked". Never record "0 findings" from a mismatched reviewer.
   - Fix any critical bugs or style issues identified during the review, re-run step 6, and push.

9. **Update Issue Checklist in GitHub**:
   - Fetch the current body (`gh api repos/{owner}/{repo}/issues/<ISSUE_NUMBER> --jq .body > logs/issue-<ISSUE_NUMBER>.body.md`
     — it may have changed since your prompt), flip the done items from `- [ ]` to `- [x]`, and
     save it with `gh api -X PATCH repos/{owner}/{repo}/issues/<ISSUE_NUMBER> -F body=@logs/issue-<ISSUE_NUMBER>.body.md`.
   - Leave struck lines (`- [ ] ~~…~~ → moved to #M`) as they are; never flip them to `[x]`.
