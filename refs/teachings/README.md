# `refs/teachings/` — Lessons from shipped solutions

Durable teaching documents distilled from features after they ship (or from design sketches
before they're built). Each lesson walks the real implementation with `file:line` citations,
names the dependencies and what each one is doing for you, and lifts the underlying ideas into
**general patterns** — stated so they transfer to codebases that look nothing like this one.

Written by the `/teach` skill; one file per topic, extended in place ("Second encounter"
sections) when a pattern shows up again rather than duplicated.

| Lesson | Patterns | Source | Date |
|---|---|---|---|
| [Recipe import (paste-to-prefill)](./recipe-import.md) | content sniffing · normalize at the boundary · line-oriented zone state machine | Stage 22, PR #80 | 2026-07-17 |
| [Import transports (file drop · batch queue · bookmarklet · hints)](./import-transports.md) | transport/parse separation · in-page extraction · batch with per-item review | [INPUT.md](../INPUT.md) §2.0–§2.3; file drop + batch shipped `import-file-drop` | 2026-07-19 (2nd: 07-22) |
| [DOM event flow for interactivity](./dom-event-flow-interactivity.md) | capture→target→bubble propagation · pointer capture · lift-handler-to-the-owning-layer | `ui-timer` — TimerDial.jsx | 2026-07-23 |
