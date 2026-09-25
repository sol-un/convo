# convo

An orchestrator that automates the Explore–Plan–Code–Commit workflow for several Tasks at once, each Step run by its own agent, with human approval of the Plan as the only hard stop. It serves a single human, and it stops at a local commit: integrating that commit (push, review, merge) is the human's business, outside convo.

## Language

### Projects

**Project**:
A registered git repository that Tasks can target, optionally with a Setup, a Teardown and a Check.
_Avoid_: Repo (in domain talk), Workspace

**Setup**:
A Project's command that makes a freshly created Worktree runnable, given the Task's identity so concurrent Tasks don't collide outside git (ports, databases, etc.). It runs when the Task starts, so exploring can already run the code.

**Teardown**:
A Project's command that releases whatever Setup took for a Task, run before the Task's Worktree is removed.

**Check**:
A Project's command (tests, lint, etc.) whose result, as run by the orchestrator itself, is the evidence that a Task's changes work; where it can, the result names each failure, so failures can be compared one by one. The Check is defined in the Project's registration, outside the repository, and agents may not change it; a change to a file the Check invokes (a script, a build target) counts as a change to the Check. Agents may change the test code it runs, but changes to existing tests must be in the approved Plan; the orchestrator finds any that are not and highlights them in the Task Report.
_Avoid_: CI, Validation

**Baseline**:
The Check's result on a Task's untouched Worktree, taken right after Setup and kept across a Replan. A Task passes its Check when it adds no failures beyond the Baseline's, and failures already in the Baseline are reported but not blamed on the Task.

### Tasks and their inputs

**Task**:
One unit of coding work in exactly one Project, started from a Prompt and usually ending in a single commit, with its own preserved context, history and Artifacts.
_Avoid_: Job, Ticket, Issue

**Committed Task**:
A Task that has gone through Commit or Override; it is complete. Its Worktree is removed; its Artifacts, the hash of its commit and its branch are kept, and the branch lasts until the human deletes it.
_Avoid_: Done, Closed, Merged

**Concluded Task**:
A Task whose approved Plan called for no code changes (investigation, a decision, a Split into other Tasks); it ends at Conclude with just its Plan, which is its record. Its Worktree is removed.
_Avoid_: Research Task

**Abandoned Task**:
A Task the human gave up on before it was committed; it is complete. Its Worktree is removed and whatever Artifacts it has are kept; if it holds code changes and already has a branch (it has been through Plan Approval), they are first captured in one work-in-progress commit on that branch; otherwise they are discarded and it leaves no branch.
_Avoid_: Deleted

**Cancelled Task**:
A Queued Task the human called off before it started; it is complete, and it has no Worktree, no Artifacts and no branch.
_Avoid_: Withdrawn

**Queued Task**:
A submitted Task waiting to start, either because the configured limit on concurrently working Sessions has been reached (Tasks waiting on the human do not count against it), or because any Task it references has not yet reached a terminal state. It starts once they all have, however they ended.

**Draft**:
A Prompt with its References that the human is still composing and has not yet submitted; it is kept only on the Client where it was written and is not yet a Task.

**Prompt**:
The human's initial instruction that starts a Task; may carry any number of References.

**Reference**:
A pointer inside a Prompt to material the agent must take into account: a file, a web page, one or more lines of existing code, or another Task. A code Reference is pinned to the content it pointed at when it was made, so the agent can be told when that content has since changed.
_Avoid_: Attachment, Link

**Task Reference**:
A Reference to another Task, which hands that Task's Artifacts (and commit hash, if any) to the new Task's planning. A Prompt may carry several; the new Task does not start until every Task it references has reached a terminal state. The new Worktree starts from the branch of a referenced Task that ended with one (a Committed Task, or an Abandoned Task with a work-in-progress commit). When submitting, the human may pick one referenced Task or the Project's main branch; otherwise, when the Task starts, a single such branch is picked automatically and none means main. If several remain and none was picked, or the picked Task ended without a branch, the Task Needs Attention before starting so the human can choose. Nothing relies on a Task's branch lasting forever. This is how follow-up work (the human's notes, code review comments, QA reports) is done: as a new Task, never by reopening the old one.
_Avoid_: Follow Up, Subtask

### Steps and Transitions

A Task is a state machine: Steps are its working states, and Transitions move it between Steps or into one of the terminal states: Committed Task, Concluded Task, Abandoned Task or Cancelled Task.

**Step**:
A working state of a Task, in which an Agent works in its own Session: Explore & Plan or Code. A Step's Session starts with fresh context, seeded only with the inputs that Step is meant to see; the one exception is the Explore & Plan Session, which a Replan resumes.
_Avoid_: Phase, Stage

**Explore & Plan**:
The first Step: the agent reads the Prompt and its References, gathers whatever else it needs, asks Questions, and produces the Plan, which it must put before an Advisor before the human accepts it. For a Prompt too big for one Task, the Plan may propose a Split.

**Code**:
The Step in which the agent changes code in the Worktree according to the approved Plan, keeping Code Notes as it goes, until the orchestrator's run of the Check passes. The Code Agent writes the commit message and the Task Report before the final run of the Check, so the commit is exactly what was checked. Entering Code after a Replan starts a fresh Session, seeded with the revised Plan, the Code Notes and the Worktree as it is. A Check that stays failing leaves the Task needing attention, where the human may send a message, Replan, Abandon, or Override.

**Transition**:
A move of a Task from one Step to another or into a terminal state: Plan Approval, Conclude, Replan, Commit, Override, Abandon or Cancel.

**Plan Approval**:
The Transition from Explore & Plan to Code, and the only hard stop: only the human can make it, by accepting the Plan. It is when the Task's branch is created.

**Conclude**:
The Transition, made by the human accepting a Plan that calls for no code changes, that ends a Task as a Concluded Task (and, for a Split, creates the new Tasks).

**Split**:
A Plan's proposal to carry out a Prompt as several new, independent Tasks; concluding it creates them, each with its own Prompt and a Task Reference to the Split Task. The new Tasks do not reference each other because they are likely to run in parallel, and a Task cannot start until every Task it references has reached a terminal state. Each such Task still goes through its own Explore & Plan and Plan Approval.

**Replan**:
The Transition from Code back to Explore & Plan because the approved Plan turns out to be unworkable, either at the Code Agent's initiative or because the human stopped it. Planning resumes in the original Explore & Plan Session, the revised Plan needs a new Plan Approval, and code already written is kept. The only way to change an approved Plan.

**Commit**:
The Transition, made automatically once the Check passes, that ends a Task as a Committed Task: the orchestrator makes the Task's single local commit, on the Task's branch, with the message the Code Agent wrote. A Project without a Check never commits automatically; its Tasks can only be committed by Override.

**Override**:
The human's Transition that commits a Task despite a failing (or absent) Check; it is recorded, and the Task Report marks the Check as failed. The Code Agent is first asked to write the commit message and the Task Report; if it cannot, the orchestrator writes minimal ones.

**Abandon**:
The human's Transition, available from any Step, that ends a Task as an Abandoned Task.

**Cancel**:
The human's Transition, available only while a Task is Queued, that ends it as a Cancelled Task.

### Agents

**Session**:
One Agent at work on one Step of one Task: its conversation and context, which are preserved, resumed after a Replan, and watched or steered from any Client.
_Avoid_: Agent Run, Run

**Subagent**:
A short-lived Agent a Session spawns to do part of its work (e.g. a Planner fanning out low-tier Subagents for grunt work). It is not a Session, does not count toward the limit on concurrently working Sessions, never has permissions beyond its parent's, and its work is visible from the parent Session.

**Agent**:
A named, human-configurable definition of a worker suited to a kind of work (its model, skills, tools, system prompt, etc.), e.g. a Planner that uses a high-tier model and cannot edit files, or a Worker that uses a mid-tier model and can. Agents are assigned to Steps, and to the Advisor role, globally by default, and each assignment can be overridden per Task or per Step.
_Avoid_: Profile, Persona

**Advisor**:
The role of an Agent that any Step's Agent may consult, as a Subagent, for an unbiased opinion. The orchestrator, not the caller, seeds it: the caller passes only its question, and the Advisor sees the Task's Artifacts and work, but never the caller's reasoning. Its advice is folded into the Plan or the Task Report rather than shown to the human, except that any objection not adopted is listed there with the reason; the whole consultation can be viewed on demand. Consulting it is mandatory before the human accepts a Plan (again whenever the Plan has changed materially since the last consultation) and optional (limited to correctness and departures from the Plan) during Code.
_Avoid_: Reviewer, AI Review

### Artifacts

**Artifact**:
A file a Step produces that later Steps, later Tasks (via a Task Reference) and the human may consume; the human may edit any Artifact directly, except an approved Plan.

**Plan**:
The Artifact describing what will be changed and how (or, for a Task with no code changes, its findings, decision or Split), which the human must accept through Plan Approval or Conclude. Once approved it is frozen; only a Replan changes it.

**Code Notes**:
The Artifact the Code Agent keeps as it works: departures from the Plan and why (those the human asked for while steering the Session kept apart from the agent's own), what was tried and dropped, what is left open. It survives the Session's own context and is what a Replan hands back to planning.

**Task Report**:
The Artifact a Committed Task ends with, summarizing what it did and why, how it departed from the Plan (at the human's direction or on its own), the Check's result, any unplanned changes to existing tests, what was learned and what is left open. It is the main thing a Task Reference hands over, and the human's record for self-appraisal.

### Interaction

**Feedback**:
The human's notes on the Plan before accepting it, which the planning agent follows up on within its existing context.
_Avoid_: Rejection

**Question**:
A stop the agent raises when it needs the human's input, carrying its recommended answer; independent Questions may be raised together as one batch. During Explore & Plan the agent is encouraged to ask; during Code it asks only when it is truly blocked, and otherwise decides on its own and records the choice in the Code Notes. The Task Needs Attention until the human answers.

**Change Notice**:
A short note attached to a Session's next turn naming files the Agent has seen (read, written, or behind a pinned Reference) that changed outside it since; it names what changed without showing the content, and the Agent decides whether to re-read. An Agent always learns of outside changes this way.

**Needs Attention**:
The condition of a Task that cannot progress without the human: waiting for its Plan to be accepted, on a Question, or stopped by an error (a network failure, a Check that stays failing, etc.) or by the human, or, before it starts, on the human's choice of which referenced Task's branch to start from. The human is always notified through the channel native to the Client's platform.
_Avoid_: Pending, Blocked

**Worktree**:
The isolated git working copy that belongs to exactly one Task from the moment it starts until it ends, when the Worktree (never the branch) is removed. It is detached during Explore & Plan and gets the Task's own branch at Plan Approval, so a Task that commits nothing (a Concluded Task) leaves no branch.

**Client**:
Any interface the human uses to view and act on Tasks (e.g. the web UI on a desktop, the same UI installed on a phone); the human can switch Clients mid-Task without losing anything.

## Relationships

- A **Project** has many **Tasks**; a **Task** belongs to exactly one **Project**
- A **Task** starts from exactly one **Prompt**, which has zero or more **References**, possibly including **Task References**
- A **Task** owns exactly one **Worktree** until it ends; its **Artifacts** live outside the **Worktree**
- A **Task**'s **Steps** are **Explore & Plan** and **Code**; **Plan Approval** leads from the first to the second, **Replan** leads back
- A **Task** ends through **Commit** or **Override** (a **Committed Task**, with one commit), **Conclude** (a **Concluded Task**), **Abandon** (an **Abandoned Task**) or, while still Queued, **Cancel** (a **Cancelled Task**)
- A **Plan** is always put before an **Advisor** before **Plan Approval** or **Conclude**
- **Commit** happens only once the **Check** has passed, as run by the orchestrator; otherwise (or if the **Project** has no **Check**) only an **Override** gets the Task committed
- A **Commit** is local; convo never pushes, merges or deletes branches
- Each **Step** is performed by an **Agent** in its own **Session**, which may spawn **Subagents**; the **Advisor** is consulted as a **Subagent** the orchestrator seeds
- Every **Task** that reaches **Plan Approval** or **Conclude** has a **Plan**; a **Committed Task** also has a **Task Report**
- A **Session** receives a **Change Notice** whenever something it has seen changes outside it
- A **Task** that is waiting for its **Plan** to be accepted, on a **Question**, or after being stopped by an error or by the human **Needs Attention**
- Several **Tasks** can be in progress at the same time
