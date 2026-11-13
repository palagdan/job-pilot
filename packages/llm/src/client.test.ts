import { APIError } from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlm, type UsageRecord } from './client.ts';
import { LlmError } from './errors.ts';
import { defaultModels } from './models.ts';

type Step = unknown | Error;

const completion = (content: string, prompt = 10, completionTokens = 5) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: prompt, completion_tokens: completionTokens },
});

const apiError = (status: number, headers?: Record<string, string>) =>
  new APIError(status, { message: `http ${status}` }, `http ${status}`, new Headers(headers));

const setup = (steps: Step[]) => {
  const calls: Record<string, unknown>[] = [];
  const create = vi.fn(async (body: Record<string, unknown>) => {
    calls.push(structuredClone(body));
    const step = steps.shift();
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(body);
    return step;
  });
  const usage: UsageRecord[] = [];
  const sleep = vi.fn(async () => {});
  const llm = createLlm({
    apiKey: 'k',
    concurrencyUnits: 4,
    timeoutMs: 1000,
    models: defaultModels,
    recordUsage: (u) => void usage.push(u),
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake of the OpenAI client
    openai: { chat: { completions: { create } } } as any,
    sleep,
  });
  return { llm, calls, create, usage, sleep };
};

const sent = (calls: Record<string, unknown>[], i: number) =>
  (calls[i]?.messages ?? []) as { role: string; content: string }[];

const messages = [{ role: 'user' as const, content: 'hi' }];
const schema = z.object({ city: z.string() });

describe('generateObject', () => {
  it('parses valid JSON and sends json_object + schema instruction', async () => {
    const { llm, calls, usage } = setup([completion('{"city":"Berlin"}')]);
    const res = await llm.generateObject({ task: 'suggest', schema, messages });
    expect(res.object).toEqual({ city: 'Berlin' });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(calls[0]?.response_format).toEqual({ type: 'json_object' });
    expect(calls[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
    const first = sent(calls, 0)[0];
    expect(first?.role).toBe('system');
    expect(first?.content).toContain('"city"');
    expect(usage).toHaveLength(1);
  });

  it('parses think-wrapped and fenced JSON', async () => {
    const { llm } = setup([completion('<think>hmm</think>\n```json\n{"city":"Oslo"}\n```')]);
    const res = await llm.generateObject({ task: 'suggest', schema, messages });
    expect(res.object.city).toBe('Oslo');
  });

  it('repairs once after an invalid first answer', async () => {
    const { llm, calls, usage } = setup([completion('{"city":1}'), completion('{"city":"Rome"}')]);
    const res = await llm.generateObject({
      task: 'suggest',
      schema,
      messages,
      prompt: { version: 'x@1' },
    });
    expect(res.object.city).toBe('Rome');
    expect(res.usage.inputTokens).toBe(20);
    expect(calls).toHaveLength(2);
    expect(usage).toHaveLength(2);
    expect(usage[0]?.promptVersion).toBe('x@1');
    const second = sent(calls, 1);
    expect(second.at(-2)).toEqual({ role: 'assistant', content: '{"city":1}' });
    expect(second.at(-1)?.content).toContain('city');
  });

  it('throws invalid_output after two failures', async () => {
    const { llm, calls } = setup([completion('nope'), completion('still nope')]);
    const err = await llm.generateObject({ task: 'suggest', schema, messages }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('invalid_output');
    expect(err.message).toContain('still nope');
    expect(calls).toHaveLength(2);
  });
});

describe('retries', () => {
  it('retries a 429 with backoff and records both attempts', async () => {
    const { llm, create, usage, sleep } = setup([apiError(429), completion('ok')]);
    const res = await llm.generateText({ task: 'suggest', messages });
    expect(res.text).toBe('ok');
    expect(create).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(usage.map((u) => u.succeeded)).toEqual([false, true]);
    expect(llm.semaphore.inUse()).toBe(0);
  });

  it('honours retry-after', async () => {
    const { llm, sleep } = setup([apiError(429, { 'retry-after': '3' }), completion('ok')]);
    await llm.generateText({ task: 'suggest', messages });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('does not retry a 401 and releases the semaphore', async () => {
    const { llm, create, sleep, usage } = setup([apiError(401)]);
    const err = await llm.generateText({ task: 'suggest', messages }).catch((e) => e);
    expect(err.code).toBe('auth');
    expect(create).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(usage).toHaveLength(1);
    expect(llm.semaphore.inUse()).toBe(0);
  });

  it('gives up after 3 retries', async () => {
    const { llm, create } = setup([apiError(503), apiError(503), apiError(503), apiError(503)]);
    const err = await llm.generateText({ task: 'suggest', messages }).catch((e) => e);
    expect(err.code).toBe('unavailable');
    expect(create).toHaveBeenCalledTimes(4);
    expect(llm.semaphore.inUse()).toBe(0);
  });

  it('never fails the call when recordUsage throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm } = setup([completion('ok')]);
    const failing = createLlm({
      apiKey: 'k',
      concurrencyUnits: 1,
      timeoutMs: 1,
      models: defaultModels,
      recordUsage: () => {
        throw new Error('db down');
      },
      // biome-ignore lint/suspicious/noExplicitAny: fake client
      openai: { chat: { completions: { create: async () => completion('ok') } } } as any,
    });
    expect((await failing.generateText({ task: 'suggest', messages })).text).toBe('ok');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(llm).toBeDefined();
  });
});

const fakeStream = (chunks: unknown[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const c of chunks) yield c;
  },
});
const delta = (content: string) => ({ choices: [{ delta: { content } }] });

describe('streamText', () => {
  it('filters think blocks split across chunks and records final usage', async () => {
    const stream = fakeStream([
      delta('<thi'),
      delta('nk>secret'),
      delta(' stuff</th'),
      delta('ink>\n\nHel'),
      delta('lo <b>'),
      delta(' world'),
      { choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } },
    ]);
    const { llm, usage, calls } = setup([stream]);
    let out = '';
    for await (const d of llm.streamText({ task: 'chat', messages })) out += d;
    expect(out).toBe('Hello <b> world');
    expect(calls[0]?.stream_options).toEqual({ include_usage: true });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ inputTokens: 7, outputTokens: 3, succeeded: true });
    expect(llm.semaphore.inUse()).toBe(0);
  });

  it('releases the semaphore when the consumer stops early', async () => {
    const { llm, usage } = setup([fakeStream([delta('a'), delta('b'), delta('c')])]);
    for await (const _ of llm.streamText({ task: 'chat', messages })) {
      expect(llm.semaphore.inUse()).toBe(2);
      break;
    }
    expect(llm.semaphore.inUse()).toBe(0);
    expect(usage).toHaveLength(1);
  });
});

describe.skipIf(!process.env.FEATHERLESS_API_KEY)('live Featherless', () => {
  it('generateObject returns a typed object', { timeout: 120_000 }, async () => {
    const llm = createLlm({
      apiKey: process.env.FEATHERLESS_API_KEY as string,
      concurrencyUnits: 4,
      timeoutMs: 90_000,
      models: defaultModels,
    });
    const res = await llm.generateObject({
      task: 'suggest',
      schema,
      messages: [{ role: 'user', content: 'Name the capital of Germany as { "city": string }.' }],
    });
    expect(typeof res.object.city).toBe('string');
  });
});
