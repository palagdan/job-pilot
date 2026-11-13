import { type LlmTask, llmTasks } from '@job-pilot/shared/enums';

export type ModelConfig = {
  model: string;
  /** Featherless concurrency units one in-flight request uses: <=16B = 1, 17-35B = 2, >35B = 4. */
  units: number;
  maxTokens: number;
  temperature: number;
  thinking: boolean;
};

const small = { model: 'Qwen/Qwen3-14B', units: 1, thinking: false };
const medium = { model: 'Qwen/Qwen3-32B', units: 2, thinking: false };

/** First guesses, to be finalised by the model spike. */
export const defaultModels: Record<LlmTask, ModelConfig> = {
  parse_cv: { ...small, maxTokens: 4000, temperature: 0 },
  suggest: { ...small, maxTokens: 500, temperature: 0.3 },
  rank: { ...small, maxTokens: 2000, temperature: 0.1 },
  write_cv: { ...medium, maxTokens: 4000, temperature: 0.5 },
  write_drafts: { ...medium, maxTokens: 2000, temperature: 0.5 },
  chat: { ...medium, maxTokens: 1500, temperature: 0.5 },
};

/** Applies `LLM_MODEL_<TASK>` (model id) and `LLM_UNITS_<TASK>` overrides from an env-like object. */
export const resolveModels = (
  env: Record<string, string | undefined> = {},
): Record<LlmTask, ModelConfig> => {
  const models = { ...defaultModels };
  for (const task of llmTasks) {
    const key = task.toUpperCase();
    const model = env[`LLM_MODEL_${key}`];
    const units = Number(env[`LLM_UNITS_${key}`]);
    models[task] = {
      ...models[task],
      ...(model ? { model } : {}),
      ...(Number.isInteger(units) && units >= 1 ? { units } : {}),
    };
  }
  return models;
};
