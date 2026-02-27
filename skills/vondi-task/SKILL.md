---
name: vondi-task
description: "Full-cycle implementation pipeline for Vondi Global codebase. Use when user wants to implement a feature, fix a bug, or make any code change. Input: desired outcome in one sentence. Output: verified, tested, working code. Pipeline: auto-discovery → parallel research → plan → triple-audit → implementation → post-impl audit. Zero hallucinations, zero skipped steps. Token cost is irrelevant — quality is the only metric."
metadata: { "openclaw": { "emoji": "⚙️" } }
---

# Vondi Task Pipeline

Input: one sentence describing the desired outcome.
Output: working, tested, audited code — no user intervention except one plan approval and genuine blockers.

## Pipeline (execute in order, never skip)

### PHASE 0 — SCOPE DISCOVERY (2-3 min)

Auto-discover everything touched by this task. Do NOT ask the user what files are involved.

```
Grep across /p/github.com/vondi-global/[all repos]:
  - function/method names related to the task
  - table names, column names
  - proto service/rpc names
  - route/endpoint paths
  - frontend component names
  - i18n keys
  - test files
  - migration files

Result: explicit list of file:line references. Zero assumptions.
```

If scope spans multiple repos — list all of them explicitly before proceeding.

### PHASE 1 — PARALLEL DEEP RESEARCH (parallel agents)

Launch agents in parallel, one per concern:

| Agent | Responsibility |
|-------|---------------|
| Explore (backend) | All .go files in scope: current state, interfaces, data flow |
| Explore (proto/DB) | .proto files, migrations, schema — exact field names |
| Explore (frontend) | .tsx/.ts files, BFF proxy, i18n keys |
| Explore (tests) | Existing test coverage for touched code |

Rules for all research agents:
- Every finding must cite file:line
- FORBIDDEN: assume any function/table/field exists without grep verification
- If something is not found — write "NOT FOUND" not a guess

### PHASE 2 — PLAN (MD file)

File: `/p/github.com/vondi-global/passport/tasks/[TASK_SLUG]_PLAN.md`

Structure:
```markdown
## Goal
[Exact desired outcome]

## Current State
[What exists now — every claim has file:line proof]

## Gap Analysis
[What is missing or broken — with file:line evidence]

## Implementation Steps
[Ordered, atomic steps. Each step = one logical change to one area]
Step N: [action] in [file:line] — depends on: [step numbers or none]

## Acceptance Criteria
[How to verify the task is done — runnable commands or observable behavior]

## Risk / Rollback
[What could go wrong, how to revert]
```

### PHASE 3 — TRIPLE PLAN AUDIT (parallel, with self-correction loop)

Launch 3 auditors in parallel:

**Auditor 1 — Zero Hallucinations**
- Take every function, table, field, method, component mentioned in the plan
- Grep for each one in the real codebase
- Any that don't exist → flag → fix in plan immediately

**Auditor 2 — Completeness**
- Is every affected service covered?
- Are migrations included if schema changes?
- Are tests planned?
- Are there edge cases not handled?
- Check CLAUDE.md R0–R13 compliance

**Auditor 3 — Architecture**
- Does the plan violate service boundaries (R5)?
- Does it touch another service's DB directly?
- Does it introduce tech debt (R12)?
- Is CRUD complete if CRUD is involved (R6)?

After all 3 auditors report:
- Auto-apply all fixes to the plan
- Re-run audit loop if any auditor flagged issues
- Loop until all 3 give clean pass (max 3 iterations)

### PHASE 3.5 — SINGLE PAUSE: PLAN APPROVAL

Show user:
1. The plan file (link)
2. What each auditor found and fixed
3. Confidence level: HIGH / MEDIUM / LOW with reason

User says "ОК" (or corrects). Then proceed without further interruptions.

**Legitimate reasons to pause AFTER this point (only these):**
- Need credential/secret that doesn't exist in env
- Business decision with no technical answer ("should X apply to all users?")
- 3 audit loops didn't converge — show deadlock to user

### PHASE 4 — IMPLEMENTATION

Setup:
```
TodoWrite: every implementation step from plan → pending tasks
agdb sql "INSERT INTO history (date, action, context) VALUES (date('now'), 'task_start', '[TASK_SLUG]')"
```

For each step:
```
1. Implement atomic change
2. IMMEDIATELY after each .go file change: go build ./...
   IMMEDIATELY after each .tsx/.ts change: npx tsc --noEmit
3. If build/type fails → fix NOW, do not proceed to next step
4. Mark TodoWrite item complete
5. agdb: log step completion
```

Rules:
- Never commit. Never push. Only change files.
- If a step reveals something the plan missed → add it to plan + TodoWrite, continue
- If a step is blocked by missing data (not a genuine blocker) → dig deeper, don't pause

### PHASE 5 — POST-IMPLEMENTATION AUDIT (parallel)

**Auditor: Implementation vs Plan**
```
For each step in the plan:
  - Was it implemented? Show evidence (file:line of change)
  - Was it implemented correctly? (matches plan intent)
  - Any unplanned changes made? Flag them.
```

**Auditor: test-engineer agent**
```
- Run all existing tests: make test or yarn test
- Write new tests for new/changed functionality
- All tests must pass before declaring done
```

If auditors find gaps → fix them → re-audit. Loop until clean.

### PHASE 6 — FINAL REPORT

```markdown
## Task: [name]
## Status: COMPLETE / PARTIALLY COMPLETE / BLOCKED

### Implemented (plan vs reality)
| Step | Planned | Done | Files Changed |
|------|---------|------|---------------|
| 1    | ...     | ✓    | file:line     |

### Tests
- Existing tests: N passed, 0 failed
- New tests written: N

### Open items (if any)
[Only genuine blockers or business decisions]

### How to verify
[Exact command or UI flow to confirm it works]
```

## Quality Rules (non-negotiable)

- `go build ./...` must pass after every .go file change
- `npx tsc --noEmit` must pass after every .tsx/.ts change
- Zero hallucinations: every name verified via grep before use
- Never touch another service's DB directly (R5)
- Never skip audit phases to save time
- Never declare done without test-engineer sign-off

## Context

- Codebase root: `/p/github.com/vondi-global/`
- Architecture guide: `/p/github.com/vondi-global/CLAUDE.md`
- CI rules: `/p/github.com/vondi-global/passport/CI_CD_AUDIT.md`
- Agent DB: `agdb` CLI at `/home/dim/.local/bin/agdb`
- Plan files go in: `/p/github.com/vondi-global/passport/tasks/`
