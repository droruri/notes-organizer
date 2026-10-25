---
name: ralph-issue
description: Run one GitHub issue through the ralph loop the way run-ralph.sh does. Each phase (build → review → merge) runs as its own fresh subagent, following ralph/*.md, and the agents those instructions call for (investigator, planner, reviewers) are spawned too. Use when the user types /ralph-issue N or asks to "ralph issue N".
argument-hint: <issue-number> [interactive] [opus] [build|review|merge]
disable-model-invocation: true
---

# Ralph loop for one issue: `$ARGUMENTS`

You are the orchestrator. You do the job `run-ralph.sh` does for a single issue, and nothing else.
You don't read code or diffs and you don't do the steps yourself. Every phase runs in a fresh
subagent, the way the script starts a fresh `claude` process for each phase. The progress file
`logs/issue-N.progress.md` is the only hand-off between phases.

## 1. Arguments

- First token: the issue number (`N` below). Missing or not a number → stop and ask for one.
- Models, as in `run-ralph.sh`: the `build` agent uses `model: "sonnet"` (`"opus"` if `opus` was
  given); the `review` and `merge` agents use `model: "haiku"`.
- A phase name (`build`, `review` or `merge`) → run only that phase. Otherwise run all three, in order.
- `interactive` → phase agents bring decisions to the user (see step 5). The default is the
  script's hands-off behavior.

## 2. Pre-flight (the same checks as the script, in one Bash call)

- Use REST only (`gh api repos/{owner}/{repo}/...`): cloud sessions block GraphQL, so no
  `gh issue|pr <subcommand>`. Run `gh api repos/{owner}/{repo}/issues/N` (`.state`, `.title`,
  `.body`, `.labels[].name`). Work out the state the way `issue_state` in
  `run-ralph.sh` does:
  - closed → report and stop;
  - labeled `needs-human` or `blocked` → report and stop;
  - labeled `ralph:running` → another ralph run holds it: report and stop;
  - otherwise it's open.
- Run `gh api repos/{owner}/{repo}/issues/N/labels -f 'labels[]=ralph:running'` (the lock; remove it in step 7, whatever the
  outcome).
- Run `WT=$(scripts/ralph-worktree.sh create N)` and note the path `WT`. All work happens there;
  your own checkout is never switched, so uncommitted changes in it don't matter.
- Run `cd "$WT" && "$OLDPWD/scripts/ralph-progress.sh" pull N`.
- `RALPH_HOME` below is this checkout's absolute path (`pwd`).

## 3. Run each phase as a subagent

For each phase, spawn **one** `general-purpose` Agent with the chosen `model` and
`description: "ralph #N <phase>"`. Use this prompt, which is the script's prompt plus the
subagent protocol:

````
Read <RALPH_HOME>/ralph/shared.md and your phase's file (<RALPH_HOME>/ralph/<phase>.md; for build also ralph/review.md) and execute PHASE <phase> for Issue #N.

Your working directory is this issue's worktree, <WT>, already on branch feature/issue-N. Work
only inside it: start every Bash command with `cd <WT> &&` and give Read/Edit absolute paths
under <WT>. Wherever the instructions say `$RALPH_HOME`, use <RALPH_HOME>.

ISSUE TITLE: <title>

ISSUE DETAILS & CHECKLIST:
<body, verbatim>

## Running as a subagent

You cannot launch agents yourself. Wherever ralph/*.md (or a skill it tells you to run,
such as /mattpocock-skills:code-review) says to spawn an Agent, do this instead: write the
progress file, then end your reply with one block per agent to launch, and stop:

AGENT_REQUEST type=<subagent_type>
<the full prompt that agent should get>
END_AGENT_REQUEST

Put agents that should run in parallel (such as the Standards and Spec reviewers) in the same
reply. Their replies come back to you in a message, labeled by type. Continue the step from
exactly where you stopped.

<interactive only> Where ralph/*.md says "If blocked", or where a real design choice
comes up that the issue doesn't settle, don't label the issue yet. End your reply with
`DECISION_NEEDED: <question with options>` and stop. The answer comes back in a message.
Before the squash-merge in step 10, end with `DECISION_NEEDED: merge PR <url>? CI: <result>`.

When the phase is finished (or you stopped under "If blocked"), end with
`PHASE_DONE: <one line: outcome and the progress file's next: line>`.
````

## 4. Relay loop (inside one phase)

Read the phase agent's last reply:

- **`AGENT_REQUEST` blocks** → launch every requested agent **in one message**, so they run in
  parallel, with the requested `subagent_type` and prompt. Then load `SendMessage` (ToolSearch
  `select:SendMessage`) and send the combined replies to the **same** phase agent, one section
  per agent:

  ```
  ## <type> reply
  <reply>
  ```

  Don't read or judge the replies yourself; they're the phase agent's input.
- **`DECISION_NEEDED`** (interactive only) → ask the user with AskUserQuestion. Send the answer
  back with SendMessage.
- **`PHASE_DONE`** or anything else → the phase is over. Go to step 6.

Cap each phase at 8 relays. If a phase still isn't done after that, treat it as stuck: stop and
report.

## 5. Interactive vs default

- **Default:** the same as `run-ralph.sh`. Nothing is asked. "If blocked" means the phase agent
  adds `needs-human`, posts a comment, and stops. The merge happens as soon as CI is green.
- **`interactive`:** the steps and the agents are the same. The only difference is that the
  `DECISION_NEEDED` points from step 3 go to the user.

## 6. After each phase (the same check as the script)

Run `gh api repos/{owner}/{repo}/issues/N --jq '{state, labels: [.labels[].name]}'`.

- **Closed** → stop. The issue is done, or it was found all met on `main`.
- **`needs-human` or `blocked`** → stop. Quote the comment that ralph posted.
- **Open** → if the next phase is `review` and `<WT>/logs/issue-N.progress.md` has a line starting
  `next: step 10`, the build already did the small review: skip to `merge`. If the next phase is
  `merge` and not `interactive`, first run `cd "$WT" && "$RALPH_HOME/scripts/ralph-merge.sh" N`:
  exit 0 means merged, so go to step 7; otherwise spawn the merge agent. Otherwise spawn the
  next phase's agent, fresh. Don't reuse the previous phase's agent. If that
  was the last phase you were asked to run, stop. This is the script's "still open after all
  phases" case.

## 7. Clean up and report

- Run `gh api -X DELETE repos/{owner}/{repo}/issues/N/labels/ralph:running`.
- Issue closed → `scripts/ralph-worktree.sh remove N`. Otherwise keep the worktree and give its path.

Report:

- The issue state.
- The PR: `gh api "repos/{owner}/{repo}/pulls?head={owner}:feature/issue-N&state=all" --jq '.[] | {number, state, html_url}'`.
- Which phases ran, and each phase's `PHASE_DONE` line.

If the issue isn't closed, also include the progress file (`cat <WT>/logs/issue-N.progress.md`, as
the script prints it) and the command to resume: `/ralph-issue N [<phase>]`. Step 0 resumes from the
progress file.
