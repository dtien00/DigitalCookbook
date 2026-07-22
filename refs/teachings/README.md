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
| [Import transports (file drop · batch queue · bookmarklet · hints)](./import-transports.md) | transport/parse separation · in-page extraction · batch with per-item review | design sketch, [INPUT.md](../INPUT.md) §2.0–§2.3 (unshipped) | 2026-07-19 |
