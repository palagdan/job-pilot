import type { LlmTask } from '@job-pilot/shared/enums';
import OpenAI from 'openai';
import { z } from 'zod';
import { classifyError, LlmError } from './errors.ts';
import type { ModelConfig } from './models.ts';
import type { ChatMessage } from './prompt.ts';
import { createSemaphore } from './semaphore.ts';

export type UsageRecord = {
  task: LlmTask;
  model: string;
  promptVersion?: string;
  userId?: string;
  agentRunId?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  succeeded: boolean;
};

export type LlmConfig = {
  apiKey: string;
  baseURL?: string;
  concurrencyUnits: number;
  timeoutMs: number;
  models: Record<LlmTask, ModelConfig>;
  recordUsage?: (u: UsageRecord) => Promise<void> | void;
  /** Injectable for tests. */
  openai?: OpenAI;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type CallOptions = {
  task: LlmTask;
  prompt?: { version: string };
  userId?: string;
  agentRunId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type Usage = { inputTokens: number; outputTokens: number };

const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;

const stripThink = (text: string) =>
  text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();

const stripFences = (text: string) => text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] ?? text;

/** Removes `<think>…</think>` from a stream. Tags may be split across chunks. */
const createThinkFilter = () => {
  const open = '<think>';
  const close = '</think>';
  let buffer = '';
  let inThink = false;
  let started = false;

  const emit = (text: string) => {
    if (started) return text;
    const trimmed = text.trimStart();
    if (trimmed) started = true;
    return trimmed;
  };

  return {
    push(chunk: string): string {
      buffer += chunk;
      let out = '';
      for (;;) {
        if (inThink) {
          const end = buffer.indexOf(close);
          if (end === -1) return emit(out);
          buffer = buffer.slice(end + close.length);
          inThink = false;
          continue;
        }
        const start = buffer.indexOf(open);
        if (start !== -1) {
          out += buffer.slice(0, start);
          buffer = buffer.slice(start + open.length);
          inThink = true;
          continue;
        }
        // Hold back a trailing partial "<think>" until the next chunk decides.
        let keep = 0;
        for (let n = Math.min(open.length - 1, buffer.length); n > 0; n--) {
          if (open.startsWith(buffer.slice(-n))) {
            keep = n;
            break;
          }
        }
        out += buffer.slice(0, buffer.length - keep);
        buffer = buffer.slice(buffer.length - keep);
        return emit(out);
      }
    },
    flush(): string {
      const rest = inThink ? '' : buffer;
      buffer = '';
      return emit(rest);
    },
  };
};

export const createLlm = (config: LlmConfig) => {
  const openai =
    config.openai ??
    new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? 'https://api.featherless.ai/v1',
      maxRetries: 0, // we do our own backoff
    });
  const semaphore = createSemaphore(config.concurrencyUnits);
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const record = async (
    opts: CallOptions,
    model: ModelConfig,
    usage: Usage,
    startedAt: number,
    succeeded: boolean,
  ) => {
    if (!config.recordUsage) return;
    try {
      await config.recordUsage({
        task: opts.task,
        model: model.model,
        ...(opts.prompt ? { promptVersion: opts.prompt.version } : {}),
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
        ...usage,
        durationMs: Date.now() - startedAt,
        succeeded,
      });
    } catch (err) {
      console.error('llm: failed to record usage', err);
    }
  };

  const backoff = async (err: LlmError, attempt: number, signal?: AbortSignal) => {
    if (signal?.aborted) throw signal.reason;
    const base = err.code === 'rate_limited' || err.code === 'unavailable' ? 2000 : 1000;
    const jitter = 0.5 + Math.random() / 2;
    const delay =
      err.retryAfterMs !== undefined
        ? Math.min(err.retryAfterMs, MAX_BACKOFF_MS)
        : Math.min(MAX_BACKOFF_MS, base * 2 ** attempt * jitter);
    await sleep(delay);
  };

  const params = (model: ModelConfig, messages: ChatMessage[], extra: object = {}) =>
    ({
      model: model.model,
      messages,
      max_tokens: model.maxTokens,
      temperature: model.temperature,
      // Featherless-specific; the SDK serialises unknown body keys as-is.
      ...(model.thinking ? {} : { chat_template_kwargs: { enable_thinking: false } }),
      ...extra,
    }) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

  /**
   * Retries `run` on retryable errors. `run` must hold the semaphore only while the request is in
   * flight; it is released before we sleep.
   */
  const withRetries = async <T>(opts: CallOptions, run: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (raw) {
        const err = classifyError(raw);
        if (!err.retryable || attempt >= MAX_RETRIES) throw err;
        await backoff(err, attempt, opts.signal);
      }
    }
  };

  const complete = (
    opts: CallOptions,
    messages: ChatMessage[],
    extra: object = {},
  ): Promise<{ text: string; usage: Usage }> => {
    const model = config.models[opts.task];
    return withRetries(opts, async () => {
      const release = await semaphore.acquire(model.units, opts.signal);
      const startedAt = Date.now();
      try {
        const res = await openai.chat.completions.create(params(model, messages, extra), {
          ...(opts.signal ? { signal: opts.signal } : {}),
          timeout: opts.timeoutMs ?? config.timeoutMs,
        });
        const usage = {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        };
        release();
        await record(opts, model, usage, startedAt, true);
        return { text: stripThink(res.choices[0]?.message?.content ?? ''), usage };
      } catch (err) {
        release();
        await record(opts, model, { inputTokens: 0, outputTokens: 0 }, startedAt, false);
        throw err;
      }
    });
  };

  const sumUsage = (a: Usage, b: Usage): Usage => ({
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  });

  return {
    /** Concurrency state, mainly for diagnostics and tests. */
    semaphore,

    generateText(opts: CallOptions & { messages: ChatMessage[] }) {
      return complete(opts, opts.messages);
    },

    async generateObject<S extends z.ZodType>(
      opts: CallOptions & { schema: S; messages: ChatMessage[] },
    ): Promise<{ object: z.infer<S>; usage: Usage }> {
      const instruction = `Respond with a single JSON object only, no prose, matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(opts.schema))}`;
      const [first, ...rest] = opts.messages;
      const messages: ChatMessage[] =
        first?.role === 'system'
          ? [{ role: 'system', content: `${first.content}\n\n${instruction}` }, ...rest]
          : [{ role: 'system', content: instruction }, ...opts.messages];
      const extra = { response_format: { type: 'json_object' } };

      const parse = (
        text: string,
      ): { ok: true; object: z.infer<S> } | { ok: false; error: string } => {
        let json: unknown;
        try {
          json = JSON.parse(stripFences(text));
        } catch (err) {
          return {
            ok: false,
            error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        const result = opts.schema.safeParse(json);
        return result.success
          ? { ok: true, object: result.data }
          : { ok: false, error: z.prettifyError(result.error) };
      };

      const firstTry = await complete(opts, messages, extra);
      const parsed = parse(firstTry.text);
      if (parsed.ok) return { object: parsed.object, usage: firstTry.usage };

      const repair: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: firstTry.text },
        {
          role: 'user',
          content: `Your response was not valid:\n${parsed.error}\n\nReturn the corrected JSON object only.`,
        },
      ];
      const secondTry = await complete(opts, repair, extra);
      const usage = sumUsage(firstTry.usage, secondTry.usage);
      const reparsed = parse(secondTry.text);
      if (reparsed.ok) return { object: reparsed.object, usage };

      throw new LlmError(
        'invalid_output',
        `Model output did not match the schema after one repair attempt: ${reparsed.error}\nRaw output: ${secondTry.text.slice(0, 2000)}`,
      );
    },

    /** Yields text deltas. The semaphore is held until the stream ends, errors or the consumer stops. */
    async *streamText(opts: CallOptions & { messages: ChatMessage[] }): AsyncGenerator<string> {
      const model = config.models[opts.task];
      const streamParams = {
        ...params(model, opts.messages),
        stream: true,
        stream_options: { include_usage: true },
      } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

      let release = () => {};
      let startedAt = 0;
      const stream = await withRetries(opts, async () => {
        const rel = await semaphore.acquire(model.units, opts.signal);
        startedAt = Date.now();
        try {
          const s = await openai.chat.completions.create(streamParams, {
            ...(opts.signal ? { signal: opts.signal } : {}),
            timeout: opts.timeoutMs ?? config.timeoutMs,
          });
          release = rel;
          return s;
        } catch (err) {
          rel();
          await record(opts, model, { inputTokens: 0, outputTokens: 0 }, startedAt, false);
          throw err;
        }
      });

      const usage = { inputTokens: 0, outputTokens: 0 };
      let failed = false;
      const filter = createThinkFilter();
      try {
        for await (const chunk of stream) {
          if (chunk.usage) {
            usage.inputTokens = chunk.usage.prompt_tokens ?? 0;
            usage.outputTokens = chunk.usage.completion_tokens ?? 0;
          }
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            const text = filter.push(delta);
            if (text) yield text;
          }
        }
        const rest = filter.flush();
        if (rest) yield rest;
      } catch (err) {
        failed = true;
        throw classifyError(err);
      } finally {
        release();
        // An early stop by the consumer is not a failure.
        await record(opts, model, usage, startedAt, !failed);
      }
    },
  };
};

export type Llm = ReturnType<typeof createLlm>;
