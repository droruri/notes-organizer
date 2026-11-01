---
name: ralph-epic
description: Run a whole epic of GitHub issues through the ralph loop in dependency order, up to 3 in parallel worktrees, with a dry-run plan first and a live status table on a pinned issue.
argument-hint: <label | N-M | N,N,...> [dry-run] [--status-issue N]
disable-model-invocation: true
---

# Ralph epic: `$ARGUMENTS`

You are the launcher. `scripts/ralph-epic.sh` is the scheduler; it owns the DAG, the concurrency
cap, the blocker splits and the status comment. You read no code and run no phase yourself.

How the script runs the epic, so you can explain it:

- The DAG comes from each issue body: `## Blocked by` plus any "Depends on #N" line.
- Each ready issue runs `run-ralph.sh <N>` in its own worktree (`.ralph/wt/issue-N`): build, PR,
  Standards + Spec reviewers (one combined reviewer for a diff under ~150 lines), CI wait,
  squash-merge. Each phase is a fresh `claude` process, so it spawns reviewers itself.
- At most `RALPH_EPIC_MAX` (default 3) run at once. After each finished run the DAG is re-read
  from GitHub and newly unblocked issues start.
- A whole-issue blocker (ralph labeled the issue `needs-human`) becomes its own `needs-human`
  issue. The parent is commented on and waits on that issue. Other branches carry on.
- The live status table is one comment on a `[epic] <selector>` issue labeled `ralph:epic`. The
  script pins that issue when GitHub allows it. The ralph loop skips this label.

## 1. Arguments

- Selector: the first token (a label, usually `epic:<slug>` from CLAUDE.md "Epics", a range like `152-157` or `#152–#157`, or a list like
  `152,153,156`). Missing → ask for it and stop.
- `dry-run` → stop after step 2.
- `--status-issue N` → pass it to `run` (the status table goes on issue N).

## 2. Dry run (always first)

Run `scripts/ralph-epic.sh plan '<selector>'` and show its output to the user verbatim: the
table, the waves, "Would start now" and the warnings. Stop here when:

- `dry-run` was given;
- the output says "All issues are closed" or "Would start now: nothing" with no issue waiting on
  an in-epic blocker. Say what holds each open issue (needs-human, outside blocker, cycle).

## 3. Confirm

The run pushes branches and squash-merges PRs into `main`. Ask with AskUserQuestion: start the
epic as planned, or stop. Mention that every running issue starts its own Supabase test DB in
Docker, so Docker must be up.

## 4. Launch

Run `scripts/ralph-epic.sh run '<selector>' [--status-issue N]` with Bash `run_in_background`.
After the first `epic:` line appears in its output (the `status issue #N` line), give the user the
status issue URL and the `logs/epic/issue-N.out` log location. Then end your turn: the harness
wakes you when the script exits.

## 5. Report (when the script exits)

Read the tail of the background output: the `epic:` event lines and the final per-issue summary.
Report:

- Merged issues, each with its PR.
- Each blocker split: `#parent → #blocker (needs-human)`, and what the human has to do (from the
  blocker issue body).
- Each issue whose run ended still open, with `logs/issue-N.<phase>.log`.
- Each issue still waiting, and on what.
- To resume after a human clears a blocker: run `/ralph-epic <selector>` again. All state lives
  on GitHub, so the script picks up where it stopped.
