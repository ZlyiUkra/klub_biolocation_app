# grill-me briefing

lastActualized: 2026-10-10
sources: local (the global skill's own standards of proof, restated for this topic); see _common-facts.md

## Standards of proof for this topic (stable)

- [2026-10-10] security: a path from an untrusted input to the secret reference, naming the file and the request;
  "one table makes it safer" must say which attacker is stopped, given that one DB role reads both tables.
- [2026-10-10] performance: name the request that gets slower; the lists never join the source, so a claim about list
  cost needs a measured query, not a feeling about table width.
- [2026-10-10] best-practices: name a second real consumer for any abstraction (a supertype table, a view); say what
  breaks in T137/T080/T082 under each option.
- [2026-10-10] pragmatist: "do not touch it" must show what the owner loses and that a later migration stays cheap;
  "change it" must show what the user-visible gain is, given that no page changes.
- [2026-10-10] nitpicker: a naming or wording defect must point at a file and a line, and say whether it is editable
  (applied migrations are not).
- [2026-10-10] Convergence of three or more archetypes counts by independent paths, not by votes.

## Observations from the consilium of 2026-10-10 (video source structure)

- [2026-10-10] security first rated "a paid video flipped to public leaks the secret" HIGH; asked for the writer that
  bypasses store_video it named none and downgraded to LOW-MEDIUM (a trap for a future writer, no attacker). Ask for the
  writer by file and function whenever a severity rests on "someone could".
- [2026-10-10] nitpicker claimed a stale yandex-disk row survives paid -> public; reading store_video's own update branch
  showed it is overwritten in the same call. Read the writer's branch before accepting a "stays behind" claim.
- [2026-10-10] best-practices argued for a supertype table by naming T137's file adapter as the second consumer; the
  task text lists it but nothing in code consumes it yet, and the proposed row would carry filler. A consumer that exists
  only in a task description counts as one claimed, not demonstrated.
- [2026-10-10] pragmatist's first report said "docs only"; once the two other findings were put to it, it estimated the
  fix at about an hour and changed its route. Put concrete findings of others to the pragmatist before taking "no change".
