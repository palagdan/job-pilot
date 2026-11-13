import type { LlmTask } from '@job-pilot/shared/enums';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Versioned prompt. Convention: one file per prompt under `src/prompts/<name>.ts`, and bump
 * `version` (e.g. `'parse-cv@2'`) on every wording change. The version is logged to
 * `llm_usage.prompt_version`, so output quality can be compared across versions.
 */
export const definePrompt = <Input>(def: {
  name: string;
  version: string;
  task: LlmTask;
  system: string;
  user: (input: Input) => string;
}) => ({
  name: def.name,
  version: def.version,
  task: def.task,
  messages: (input: Input): ChatMessage[] => [
    { role: 'system', content: def.system },
    { role: 'user', content: def.user(input) },
  ],
});

export type Prompt<Input> = ReturnType<typeof definePrompt<Input>>;
