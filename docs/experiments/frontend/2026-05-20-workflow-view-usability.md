# Workflow View Usability Experiment

> Date: 2026-05-20
> Area: frontend / workflow page
> Status: planned

## Background

The current workflow page already has a useful base: core stages, current pipeline, history records, and a stage configuration panel. In actual use it still reads more like an execution log than an asset-production workbench.

The next change should stay experimental until the interaction model is validated. Do not move these conclusions into `docs/reference/frontend.md` or `docs/reference/pipeline.md` until the implementation has been tested in the app.

## Goals

1. Make the next actionable pipeline step obvious.
2. Reduce ambiguity around stage actions such as "run", "rerun", and "view result".
3. Make the empty workflow page useful for first-time or fresh-project usage.
4. Keep the change frontend-scoped unless the experiment proves that backend data is missing.

## Non-Goals

- Do not redesign the whole pipeline system.
- Do not move the pipeline config panel into a drawer in this first pass.
- Do not change backend pipeline APIs unless the frontend cannot infer enough state.
- Do not rewrite history grouping or session data models yet.

## Current Problems

### Stage State Is Too Binary

The page currently mostly communicates whether a stage has run. It does not clearly show whether the stage is:

- not started
- ready to run
- currently executing
- completed
- blocked by review or errors

This makes it harder for users to understand where the batch is stuck.

### Stage Actions Lack Context

The button copy is too generic. A completed stage and an unstarted stage can both look executable, even though the user's mental model is different:

- unstarted: run
- completed: view result or rerun
- executing: running
- failed or blocked: inspect issue

### Empty State Is Passive

When no pipeline runs exist, the page explains what will happen later but does not give users a direct next action.

## Proposed First-Pass Experiment

### 1. Add Derived Stage States

In `WorkflowView.tsx`, derive stage state from existing run data and `executingStage`.

Suggested state model:

```ts
type StageUiState = 'not_started' | 'ready' | 'running' | 'completed' | 'blocked'
```

Initial derivation can be conservative:

- `running`: `executingStage === stageId`
- `completed`: current pipeline has a run for this stage
- `ready`: previous stage is completed, or this is the first stage
- `not_started`: previous stage is not completed
- `blocked`: reserved for later, if run status or review count exposes it

### 2. Make Stage Buttons Semantic

Button label and style should depend on derived state:

| State | Primary Copy | Secondary Meaning |
|-------|--------------|-------------------|
| not_started | Pending | disabled or quiet |
| ready | Run | starts this stage |
| running | Running | disabled with spinner |
| completed | View Result | jump to chat or detail |
| completed + explicit affordance | Rerun | optional secondary action |
| blocked | Inspect | navigate to review or result |

First pass can avoid adding a secondary button. Use one primary button and make the completed state navigate to detail/chat. Rerun can be introduced after testing.

### 3. Improve Empty State With Real Actions

Replace passive empty copy with a compact action area:

- "Go to Chat" -> navigate to chat view
- "Start With Asset Folder" -> navigate to chat with a suggested prompt if supported; otherwise just go to chat
- "Open Guide" -> navigate to settings/help if route support exists; otherwise skip in first pass

Keep this unframed and simple, not a marketing-style hero.

## Implementation Notes

Target file:

- `fronted/src/components/workflow/WorkflowView.tsx`

Likely local changes:

- add `StageUiState` type
- add a helper like `getStageUiState(stageId, index, runs, executingStage)`
- change the stage visual opacity/color based on state
- change the action button label/icon based on state
- replace empty state content with action buttons

No backend changes are expected for this experiment.

## UI Constraints

- Keep the page dense and workbench-like.
- Avoid large hero sections or decorative cards.
- Keep cards at existing radius and styling.
- Buttons should use icons from `lucide-react`.
- Avoid text overflow in stage cards and history cards.
- Preserve the existing `scrollbar-thin` behavior.

## Validation Plan

Manual checks:

1. With no runs, workflow page shows actionable empty state.
2. With one scan run, scan appears completed and analyze appears ready.
3. Running a stage shows spinner and disabled running state.
4. Completed stages do not look identical to unstarted stages.
5. Clicking completed stage action navigates to the existing detail/chat path.
6. Layout remains stable at narrow and wide desktop widths.

Technical checks:

1. Run `npm run typecheck`.
2. If typecheck still fails from existing unrelated errors, confirm `WorkflowView.tsx` is not in the new error list.

## Risks

- Existing run records may not include enough status detail to distinguish failed or blocked stages.
- "View Result" may be vague until pipeline runs have a proper detail route.
- If stage actions navigate only to chat, users may still want a more direct result panel later.

## Success Criteria

This experiment is successful if:

- the next action is clear without reading explanatory text
- empty state helps the user start work
- completed and pending stages are visually distinct
- the change can be implemented without backend API changes

If successful, promote the stable behavior summary into:

- `docs/reference/frontend.md` for UI behavior
- `docs/reference/pipeline.md` only if the pipeline state model becomes a stable contract
