# pragmatist briefing

lastActualized: 2026-10-10
sources: local (REWRITE.md; tasks.md; the owner's messages of 2026-10-10); see _common-facts.md

## What is already paid for

- [2026-10-10] T160 is done and verified: migration 008 applied to the development database after a dump, 149 pages
  byte for byte, 117 tests green. Changing the structure again costs a new migration (008 is applied and must not be
  edited), changes in store_video, the access query, tests and docs: roughly half a day, no visible effect for visitors.
- [2026-10-10] Callers that depend on the shape: T137 (adapters), T080 (stream), T081/T082 (player, locked block) are
  not started; this is the cheapest moment to change the structure and the most expensive moment to leave it unclear.
- [2026-10-10] The owner's concern is understanding, not a defect report: "why is part of the same data in another
  table". An outcome that is "kept, with the reason written in one paragraph" is a legitimate verdict.
- [2026-10-10] Hard constraints that bound any option: a paid reference never in a list/page/API; one home; nothing of
  the old application lost; Node 20, no new dependencies.
