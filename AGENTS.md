# Instructions for coding agents

## Repo docs: architecture, plan, history

This repo keeps three folders in `docs/`. Keep them current without being asked.

- `docs/architecture/`: how the system is built today, and the decisions behind it.
- `docs/plan/`: work that is planned and not finished. One file per plan.
- `docs/history/`: what was done and why. One file per finished plan, named `YYYY-MM-DD-<topic>.md`.

**Before a bigger task:** Read `docs/architecture/`. Also read the plan and history files that touch the task.

**After a bigger task:**

1. Update `docs/architecture/` if the structure or a decision changed.
2. Write the history file. Tell the steps in order. Name the reasons, the compromises, the temporary decisions and what was learned.
3. Delete the implemented plan from `docs/plan/`. The folder only shows what comes next.
4. Mention the update in your summary. The docs change belongs to the same commit or PR as the work.

A bigger task has a plan, spans several sessions, or makes a decision someone will ask about later. Small fixes, questions and dependency updates do not count. Create the folders when the first bigger task ends.

**Why:** The code shows what the system does. These files show why it is the way it is.
