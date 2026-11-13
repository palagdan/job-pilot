# LLM models and prompts (Featherless)

Model spike: 2026-11-13. Re-run it with `node --env-file=.env packages/llm/scripts/spike.ts` from the repo root (results go to `.cache/llm-spike/results.json`).

## Chosen models (defaults in `packages/llm/src/models.ts`)

| Task | Model | Units | Why |
| --- | --- | --- | --- |
| `parse_cv` | Qwen/Qwen3-14B | 1 | As accurate as the bigger models on all 3 CVs, valid JSON on the first try, cheapest. |
| `suggest` | Qwen/Qwen3-14B | 1 | Short, low-stakes output. |
| `rank` | Qwen/Qwen3-32B | 2 | Same scores as 14B, but it also names the real gap (e.g. ".NET not listed"), which 14B missed. Volume task, so not DeepSeek. |
| `write_cv`, `write_drafts` | deepseek-ai/DeepSeek-V3.2 | 4 | Clearly the best Czech: natural, polite, no anglicisms. Low volume (only on Pursue), so the cost and ~13 s latency are fine. |
| `chat` | Qwen/Qwen3-32B | 2 | Fast enough for streaming, decent quality. |

Only 3 models in total, because Featherless also returns 429 when switching between models too often. Override any task with `LLM_MODEL_<TASK>` / `LLM_UNITS_<TASK>` in `.env`.

## Spike results

Inputs:

- **3 synthetic CVs:** Czech senior developer; English performance marketer; messy, lower-case Czech junior.
- **8 real scraped jobs:** StartupJobs, Jobs.cz and Prace.cz samples, including clearly irrelevant ones (nurse, shop assistant).
- **2 cover letters:** Czech and English.

Every call succeeded on all three models. Only one repair retry was needed in total (Qwen3-32B, one CV).

| Model | Parse CV (avg) | Rank (avg) | Cover (avg) |
| --- | --- | --- | --- |
| Qwen3-14B | 14.3 s, 3/3 first try | 5.9 s | 5.7 s |
| Qwen3-32B | 13.5 s, 3/3 (1 repair) | 6.6 s | 6.4 s |
| DeepSeek-V3.2 | 24.9 s, 3/3 | 5.0 s | 12.9 s |

Ranking the senior developer profile (fit %):

| Job | 14B | 32B | DeepSeek |
| --- | --- | --- | --- |
| Senior full-stack developer (Product Fruits) | 85 | 88 | 65 |
| Forward Deployed Engineer, AI | 75 | 72 | 35 |
| Lead Data Engineer | 65 | 68 | 25 |
| Partnership Manager | 15 | 15 | 15 |
| Quality engineer (manufacturing) | 25 | 15 | 0 |
| Nurse / shop assistant | 0 | 0–10 | 0 |

Observations:

- **Parsing:** all three kept the facts and invented nothing. Dates ("2018" → `2018-01`, "současnost" → `null`), language levels (C1 → professional, A2 → basic) and links were all correct. Minor differences only, e.g. 14B put "bc." as the degree; 32B added `https://` to links.
- **Ranking:** all three put the right job first and irrelevant jobs near 0. DeepSeek is much stricter (65 for an almost perfect match because the backend is .NET), which would look harsh on the Today screen. 32B gives a good score plus the gap note.
- **Writing in Czech:** 14B uses anglicisms ("Jako český native s C1 angličtinou"). 32B is fine but has small errors ("tří členný"). DeepSeek reads like a person wrote it.

## Prompts (`packages/llm/src/prompts/`)

| Prompt | Version | Use with | Output |
| --- | --- | --- | --- |
| `parse-cv.ts` | `parse-cv@1` | `generateObject` + `cvContentSchema` | Structured CV |
| `rank-job.ts` | `rank-job@1` | `generateObject` + `rankJobSchema` | `{ fitScore, why, gapNote }` |
| `write-cover.ts` | `write-cover@1` | `generateText` | 120–180 word cover text in the posting's language |

Bump the version on every wording change; it is logged to `llm_usage.prompt_version`.

## Known limits

- Parsing takes about 14 s per CV, so show the "Reading your CV" state in onboarding.
- Ranking is one call per job (~6 s, ~1.7k input tokens). For a run with many candidates, rank in parallel (the semaphore allows it) or batch several jobs per call later.
- These are synthetic CVs. Re-check with real uploaded CVs once upload works.
