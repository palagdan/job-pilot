import type { PipelineStats } from '@job-pilot/shared/pipeline';
import type { PipelineRepository } from '../ports/pipeline-repository.ts';

/**
 * GET /v1/pipeline/stats — the Pipeline stats row (Figma 10): Ready to send, Sent, Replied, Interviews, Offers.
 * Items that moved on still count where they have been: an interview was also sent and replied.
 */
export async function getPipelineStats(
  deps: { pipeline: PipelineRepository },
  userId: string,
): Promise<PipelineStats> {
  const n = await deps.pipeline.countByStatus(userId);
  const c = (...statuses: (keyof typeof n)[]) => statuses.reduce((sum, s) => sum + (n[s] ?? 0), 0);
  return {
    readyToSend: c('ready_to_send'),
    sent: c('sent', 'registered', 'replied', 'interview', 'offer', 'no_reply', 'rejected'),
    replied: c('replied', 'interview', 'offer'),
    interviews: c('interview', 'offer'),
    offers: c('offer'),
  };
}
