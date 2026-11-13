import { defineConfig } from 'vitest/config';

export default defineConfig({
  // DB tests share one database; the agent tests select global postings/events, so files run one by one.
  test: { fileParallelism: false },
});
