/** Background jobs the api enqueues (handled by the worker). Narrow on purpose: one method per job the api sends. */
export interface JobQueue {
  /** cv.parse: extract text, LLM parse, pre-fill the profile (Daniil's worker job). */
  enqueueCvParse(uploadId: string): Promise<void>;
}
