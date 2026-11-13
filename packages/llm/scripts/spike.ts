/**
 * Model spike: runs the v1 prompts on several Featherless models and prints quality/speed numbers.
 * Usage (repo root): node --env-file=.env packages/llm/scripts/spike.ts
 * Jobs come from `.cache/apify-samples/` (Apify test runs). Results: `.cache/llm-spike/results.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cvContentSchema } from '@job-pilot/shared/cv';
import type { LlmTask } from '@job-pilot/shared/enums';
import { createLlm, type UsageRecord } from '../src/client.ts';
import { defaultModels, type ModelConfig } from '../src/models.ts';
import { parseCvPrompt } from '../src/prompts/parse-cv.ts';
import { rankJobPrompt, rankJobSchema } from '../src/prompts/rank-job.ts';
import { writeCoverPrompt } from '../src/prompts/write-cover.ts';

const candidates: { model: string; units: number; thinking: boolean }[] = [
  { model: 'Qwen/Qwen3-14B', units: 1, thinking: false },
  { model: 'Qwen/Qwen3-32B', units: 2, thinking: false },
  // Not a Qwen3 template: don't send enable_thinking.
  { model: 'deepseek-ai/DeepSeek-V3.2', units: 4, thinking: true },
];

const cvs = {
  'dev-cs': `Jan Novák
Senior Full-stack vývojář | Praha | jan.novak@email.cz | +420 777 123 456 | github.com/jnovak
PROFIL
Full-stack vývojář s 7 lety praxe v TypeScriptu, Reactu a Node.js. Vedl jsem malý tým a stavěl SaaS produkty od nuly.
ZKUŠENOSTI
Productboard, Praha — Senior Software Engineer, 03/2021 – současnost
- Vývoj integrací (Jira, Slack) v Node.js a TypeScriptu, 2M+ požadavků denně
- Mentor 3 juniorních vývojářů, zavedení code review procesu
Seznam.cz — Frontend Developer, 2018 – 02/2021
- React aplikace pro Sklik, migrace z AngularJS
VZDĚLÁNÍ
ČVUT FIT, Ing. Softwarové inženýrství, 2012 – 2018
DOVEDNOSTI: TypeScript, React, Node.js, PostgreSQL, AWS, GraphQL, Docker
JAZYKY: čeština – rodilý mluvčí, angličtina – C1, němčina – A2`,
  'marketing-en': `MARIE SVOBODOVÁ
Performance Marketing Manager
Brno, Czech Republic · marie.s@gmail.com · linkedin.com/in/mariesvobodova

Summary: Data-driven marketer, 5 years in paid acquisition for e-commerce. Managed €80k/month budgets.

Experience
Kiwi.com, Brno | Performance Marketing Manager | Jan 2022 – now
• Owned Google Ads & Meta campaigns across 12 markets, ROAS +35% YoY
• Led a team of 2 specialists
Notino | PPC Specialist | 2019 – 2021
• Launched shopping campaigns for 6 new countries

Education: Masaryk University, Bc. Marketing Communication (2016–2019)
Skills: Google Ads, Meta Ads, GA4, Looker Studio, SQL basics, A/B testing
Languages: Czech (native), English (C2), Spanish (B1)`,
  'junior-messy': `petr dvořák   petr.dvorak99@seznam.cz
junior data analyst (looking for first job)   ostrava

school: VŠB-TUO, ekonomická fakulta, informatika v ekonomice, 2020-2024 (bc.)
internship - ArcelorMittal Ostrava 6/2023-9/2023, data analyst intern: power bi reports for production, python scripts to clean excel data
projects: kaggle titanic (python, pandas, sklearn) github.com/pdvorak/titanic ; covid dashboard in power bi
skills python pandas sql power bi excel
english b2`,
};

type SampleJob = { title: string; company: string; location: string; description: string };
const sample = (file: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(`.cache/apify-samples/${file}.json`, 'utf8'));
const toJob = (x: Record<string, unknown>): SampleJob => ({
  title: String(x.title ?? ''),
  company: String(x.company ?? x.companyName ?? ''),
  location: String(x.location ?? ''),
  description: String(x.description ?? x.descriptionText ?? ''),
});
const jobs: SampleJob[] = [
  ...sample('startupjobs-cz').map(toJob),
  ...sample('jobs-cz')
    .map(toJob)
    .filter((j) => /sestra|kvality/i.test(j.title)),
  ...sample('prace-cz')
    .map(toJob)
    .filter((j) => j.description.length > 500)
    .slice(0, 1),
];

const devProfile = `Jan Novák, Senior Full-stack developer, 7 years. TypeScript, React, Node.js, PostgreSQL, AWS, GraphQL.
Productboard (Senior Software Engineer, integrations, mentoring 3 juniors), Seznam.cz (React frontend). Prague. Czech native, English C1.`;
const devTargets =
  'Roles: Senior Full-stack Developer, Tech Lead. Locations: Prague, Remote EU. Formats: remote, hybrid. Exclusions: none.';

const rows: (UsageRecord & { call: string })[] = [];
const current = '';
const apiKey = process.env.FEATHERLESS_API_KEY;
if (!apiKey) throw new Error('FEATHERLESS_API_KEY missing (run with --env-file=.env)');

const llmFor = (c: (typeof candidates)[number]) => {
  const models = Object.fromEntries(
    (Object.keys(defaultModels) as LlmTask[]).map((t) => [t, { ...defaultModels[t], ...c }]),
  ) as Record<LlmTask, ModelConfig>;
  return createLlm({
    apiKey,
    concurrencyUnits: 40,
    timeoutMs: 120_000,
    models,
    recordUsage: (u) => {
      rows.push({ ...u, call: current });
    },
  });
};

const time = async <T>(fn: () => Promise<T>) => {
  const t0 = Date.now();
  try {
    return { ok: true as const, value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false as const, error: String(err).slice(0, 300), ms: Date.now() - t0 };
  }
};

const results: Record<string, unknown>[] = [];

await Promise.all(
  candidates.map(async (c) => {
    const llm = llmFor(c);
    for (const [name, cvText] of Object.entries(cvs)) {
      const r = await time(() =>
        llm.generateObject({
          task: 'parse_cv',
          prompt: parseCvPrompt,
          schema: cvContentSchema,
          messages: parseCvPrompt.messages({ cvText }),
        }),
      );
      results.push({ model: c.model, task: 'parse_cv', input: name, ...r });
    }
    const ranks = await Promise.all(
      jobs.map((job) =>
        time(() =>
          llm.generateObject({
            task: 'rank',
            prompt: rankJobPrompt,
            schema: rankJobSchema,
            messages: rankJobPrompt.messages({ profile: devProfile, targets: devTargets, job }),
          }),
        ).then((r) => ({
          model: c.model,
          task: 'rank',
          input: `${job.title} @ ${job.company}`,
          ...r,
        })),
      ),
    );
    results.push(...ranks);
    for (const [i, job] of [jobs[3], jobs[1]].entries()) {
      if (!job) continue;
      const r = await time(() =>
        llm.generateText({
          task: 'write_drafts',
          prompt: writeCoverPrompt,
          messages: writeCoverPrompt.messages({
            profile: devProfile,
            job,
            language: i === 0 ? 'cs' : 'en',
          }),
        }),
      );
      results.push({
        model: c.model,
        task: 'write_cover',
        input: `${job.title} (${i === 0 ? 'cs' : 'en'})`,
        ...r,
      });
    }
  }),
);

mkdirSync('.cache/llm-spike', { recursive: true });
writeFileSync('.cache/llm-spike/results.json', JSON.stringify({ results, usage: rows }, null, 2));

// ---------- Summary ----------
for (const c of candidates) {
  console.log(`\n=== ${c.model} (${c.units} units)`);
  for (const task of ['parse_cv', 'rank', 'write_cover']) {
    const rs = results.filter((r) => r.model === c.model && r.task === task) as {
      ok: boolean;
      ms: number;
    }[];
    const ok = rs.filter((r) => r.ok).length;
    const avg = Math.round(rs.reduce((s, r) => s + r.ms, 0) / Math.max(rs.length, 1));
    const llmTask = task === 'write_cover' ? 'write_drafts' : task;
    const us = rows.filter((u) => u.model === c.model && u.task === llmTask);
    const out = us.reduce((s, u) => s + u.outputTokens, 0);
    const inp = us.reduce((s, u) => s + u.inputTokens, 0);
    console.log(
      `${task.padEnd(12)} ok ${ok}/${rs.length}  attempts ${us.length}  avg ${avg} ms  tokens in ${inp} out ${out}`,
    );
  }
  for (const r of results.filter((x) => x.model === c.model && x.task === 'rank') as {
    input: string;
    ok: boolean;
    value?: { object: { fitScore: number; why: string } };
  }[]) {
    console.log(
      `  ${String(r.value?.object.fitScore ?? 'ERR').padStart(3)}  ${r.input.slice(0, 60)}`,
    );
  }
}
