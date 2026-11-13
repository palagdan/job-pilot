/**
 * Every enum used by the database, the API and the UI.
 * Plain TypeScript (no zod) so any package can import it.
 * Order matters where the UI shows options as lists.
 */

type ValueOf<T extends readonly string[]> = T[number];

// ---------- User & settings ----------

export const themes = ['system', 'light', 'dark'] as const;
export type Theme = ValueOf<typeof themes>;

/** Step the user is on during onboarding. Finished users have `onboardingCompletedAt` set. */
export const onboardingSteps = ['upload', 'confirm_profile', 'set_targets', 'schedule'] as const;
export type OnboardingStep = ValueOf<typeof onboardingSteps>;

// ---------- Profile ----------

export const experienceBands = ['lt_1', '1_3', '3_5', '5_10', '10_plus'] as const;
export type ExperienceBand = ValueOf<typeof experienceBands>;

export const noticePeriods = [
  'immediately',
  '2_weeks',
  '1_month',
  '2_months',
  '3_months',
  'more',
] as const;
export type NoticePeriod = ValueOf<typeof noticePeriods>;

export const salaryPeriods = ['month', 'year'] as const;
export type SalaryPeriod = ValueOf<typeof salaryPeriods>;

export const languageLevels = ['basic', 'conversational', 'professional', 'native'] as const;
export type LanguageLevel = ValueOf<typeof languageLevels>;

// ---------- Targets & schedule ----------

export const workFormats = ['remote', 'hybrid', 'onsite'] as const;
export type WorkFormat = ValueOf<typeof workFormats>;

export const runFrequencies = ['daily', 'every_3_days', 'weekly'] as const;
export type RunFrequency = ValueOf<typeof runFrequencies>;

/** Run time options (hour of day, user time zone). Spec: 06, 07, 08, 09, 10, 12, 18, 20. */
export const runHours = [6, 7, 8, 9, 10, 12, 18, 20] as const;
export type RunHour = (typeof runHours)[number];

/** ISO day of week: 1 = Monday ... 7 = Sunday. */
export const daysOfWeek = [1, 2, 3, 4, 5, 6, 7] as const;
export type DayOfWeek = (typeof daysOfWeek)[number];

// ---------- Uploads & CVs ----------

export const uploadKinds = ['cv_original'] as const;
export type UploadKind = ValueOf<typeof uploadKinds>;

export const parseStatuses = ['pending', 'extracting', 'parsing', 'parsed', 'failed'] as const;
export type ParseStatus = ValueOf<typeof parseStatuses>;

export const cvKinds = ['master', 'special'] as const;
export type CvKind = ValueOf<typeof cvKinds>;

/** Where the CV content came from: written by the agent, or the user's original upload (C03 "Keep my original"). */
export const cvOrigins = ['generated', 'original'] as const;
export type CvOrigin = ValueOf<typeof cvOrigins>;

/** Spec "CV status". */
export const cvStatuses = [
  'generating',
  'needs_review',
  'confirmed',
  'ready_to_send',
  'sent',
  'failed',
] as const;
export type CvStatus = ValueOf<typeof cvStatuses>;

export const fileFormats = ['pdf', 'docx'] as const;
export type FileFormat = ValueOf<typeof fileFormats>;

// ---------- Sources & ingestion ----------

/** v1: no `person` (people discovery is cut). */
export const opportunityTypes = ['job', 'event'] as const;
export type OpportunityType = ValueOf<typeof opportunityTypes>;

/** How a source is fetched: an Apify actor, or the MPSV open-data JSON file (no Apify). */
export const sourceProviders = ['apify', 'mpsv_open_data'] as const;
export type SourceProvider = ValueOf<typeof sourceProviders>;

export const sourceRunStatuses = [
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'aborted',
] as const;
export type SourceRunStatus = ValueOf<typeof sourceRunStatuses>;

// ---------- Agent runs ----------

export const runTriggers = ['scheduled', 'manual'] as const;
export type RunTrigger = ValueOf<typeof runTriggers>;

export const runStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = ValueOf<typeof runStatuses>;

/** Steps shown in "Your agent is working..." */
export const runStepKeys = [
  'read_postings',
  'check_sources',
  'rank_matches',
  'prepare_digest',
] as const;
export type RunStepKey = ValueOf<typeof runStepKeys>;

export const runStepStatuses = ['waiting', 'in_progress', 'done', 'failed'] as const;
export type RunStepStatus = ValueOf<typeof runStepStatuses>;

// ---------- Opportunities (Today) ----------

/** v1: no `connection` route. `auto` = "Let the agent decide". */
export const routes = ['auto', 'direct', 'event'] as const;
export type Route = ValueOf<typeof routes>;

/** State of a card on Today. */
export const feedStatuses = ['new', 'pursued', 'skipped', 'dismissed', 'expired'] as const;
export type FeedStatus = ValueOf<typeof feedStatuses>;

export const skipReasons = [
  'just_skip',
  'not_relevant',
  'wrong_location',
  'wrong_seniority',
  'company_excluded',
  'already_applied',
  'other',
] as const;
export type SkipReason = ValueOf<typeof skipReasons>;

// ---------- Pipeline ----------

/** Spec "Pipeline status" + `preparing` (pack is being written after Pursue). */
export const pipelineStatuses = [
  'preparing',
  'ready_to_send',
  'sent',
  'registered',
  'replied',
  'interview',
  'offer',
  'no_reply',
  'rejected',
  'skipped',
  'failed',
] as const;
export type PipelineStatus = ValueOf<typeof pipelineStatuses>;

/** Pipeline status filter groups (spec "Pipeline filters"). */
export const pipelineStatusGroups = {
  ready_to_send: ['ready_to_send'],
  in_progress: ['sent', 'registered'],
  got_reply: ['replied', 'interview', 'offer'],
  closed: ['no_reply', 'rejected', 'skipped'],
  failed: ['failed'],
} as const satisfies Record<string, readonly PipelineStatus[]>;
export type PipelineStatusGroup = keyof typeof pipelineStatusGroups;

export const pipelineSorts = ['next_follow_up', 'newest', 'status', 'company'] as const;
export type PipelineSort = ValueOf<typeof pipelineSorts>;

export const draftKinds = ['cover_text', 'form_answer', 'follow_up', 'event_prep'] as const;
export type DraftKind = ValueOf<typeof draftKinds>;

export const followUpStatuses = ['pending', 'done', 'cancelled'] as const;
export type FollowUpStatus = ValueOf<typeof followUpStatuses>;

// ---------- Activity (status history, undo, agent feedback) ----------

export const activityActors = ['user', 'agent', 'chat', 'system'] as const;
export type ActivityActor = ValueOf<typeof activityActors>;

export const activityEntities = [
  'profile',
  'targets',
  'schedule',
  'cv',
  'opportunity',
  'pipeline_item',
  'draft',
  'follow_up',
  'user',
] as const;
export type ActivityEntity = ValueOf<typeof activityEntities>;

// ---------- Chat ----------

export const chatRoles = ['user', 'assistant', 'tool'] as const;
export type ChatRole = ValueOf<typeof chatRoles>;

/** Screen the chat was opened on — drives suggestions and context. */
export const chatScreens = ['today', 'review', 'pipeline', 'cvs', 'profile', 'settings'] as const;
export type ChatScreen = ValueOf<typeof chatScreens>;

// ---------- Notifications ----------

export const emailTemplates = [
  'welcome',
  'finish_setup_reminder',
  'agent_live',
  'run_digest',
] as const;
export type EmailTemplate = ValueOf<typeof emailTemplates>;

export const emailStatuses = ['queued', 'sent', 'failed'] as const;
export type EmailStatus = ValueOf<typeof emailStatuses>;

// ---------- LLM usage ----------

export const llmTasks = [
  'parse_cv',
  'suggest',
  'rank',
  'write_cv',
  'write_drafts',
  'chat',
] as const;
export type LlmTask = ValueOf<typeof llmTasks>;
