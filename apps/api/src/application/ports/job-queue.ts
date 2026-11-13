/** Background jobs the api enqueues (handled by the worker). Narrow on purpose: one method per job the api sends. */
export interface JobQueue {
  /** cv.parse: extract text, LLM parse, pre-fill the profile (Daniil's worker job). */
  enqueueCvParse(uploadId: string): Promise<void>;
}

/** Email jobs the api enqueues (email.send, handled by the worker). */
export interface EmailJobQueue {
  /** Welcome email (01), once per user: deduplicated by `welcome:<userId>` in the worker. */
  enqueueWelcomeEmail(userId: string): Promise<void>;
}
