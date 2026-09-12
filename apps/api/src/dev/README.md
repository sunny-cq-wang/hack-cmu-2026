# `src/dev/` — scaffolding stubs, owned by nobody

P4 needs code from P2 and P3 that does not exist yet. Rather than write into
`services/targets/**`, `services/nutrition/**` or `routes/pets.ts` (owned by
others per `AGENTS.md` §3), the minimum viable versions live here.

| File | Real owner | Real home | What is missing |
|---|---|---|---|
| `petTargets.ts` | P3 | `services/targets/pet.ts` | Adaptive loop (`adaptivePct` is always 0) |
| `feedings.ts` | P3 | `routes/pets.ts` + scoring | No `recomputeDay`, no `dailyScores` row |
| `gaps.ts` | P2 | `services/nutrition/gaps.ts` | Meals carry no micronutrients yet, so micro intake reads as 0 |

**When P2/P3 land:** delete this directory and repoint the three importers —
`services/voice/tools.ts`, `services/today.ts`, and `routes/devSetup.ts`.
