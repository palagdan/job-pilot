import * as e from '@job-pilot/shared/enums';
import { pgEnum } from 'drizzle-orm/pg-core';

/** Postgres enums, generated from the shared TS enums so DB, api and web never drift. */

export const themeEnum = pgEnum('theme', e.themes);
export const onboardingStepEnum = pgEnum('onboarding_step', e.onboardingSteps);
export const experienceBandEnum = pgEnum('experience_band', e.experienceBands);
export const noticePeriodEnum = pgEnum('notice_period', e.noticePeriods);
export const salaryPeriodEnum = pgEnum('salary_period', e.salaryPeriods);
export const workFormatEnum = pgEnum('work_format', e.workFormats);
export const runFrequencyEnum = pgEnum('run_frequency', e.runFrequencies);
export const uploadKindEnum = pgEnum('upload_kind', e.uploadKinds);
export const parseStatusEnum = pgEnum('parse_status', e.parseStatuses);
export const cvKindEnum = pgEnum('cv_kind', e.cvKinds);
export const cvOriginEnum = pgEnum('cv_origin', e.cvOrigins);
export const cvStatusEnum = pgEnum('cv_status', e.cvStatuses);
export const fileFormatEnum = pgEnum('file_format', e.fileFormats);
export const opportunityTypeEnum = pgEnum('opportunity_type', e.opportunityTypes);
export const sourceRunStatusEnum = pgEnum('source_run_status', e.sourceRunStatuses);
export const runTriggerEnum = pgEnum('run_trigger', e.runTriggers);
export const runStatusEnum = pgEnum('run_status', e.runStatuses);
export const routeEnum = pgEnum('route', e.routes);
export const feedStatusEnum = pgEnum('feed_status', e.feedStatuses);
export const skipReasonEnum = pgEnum('skip_reason', e.skipReasons);
export const pipelineStatusEnum = pgEnum('pipeline_status', e.pipelineStatuses);
export const draftKindEnum = pgEnum('draft_kind', e.draftKinds);
export const followUpStatusEnum = pgEnum('follow_up_status', e.followUpStatuses);
export const activityActorEnum = pgEnum('activity_actor', e.activityActors);
export const activityEntityEnum = pgEnum('activity_entity', e.activityEntities);
export const chatRoleEnum = pgEnum('chat_role', e.chatRoles);
export const chatScreenEnum = pgEnum('chat_screen', e.chatScreens);
export const emailTemplateEnum = pgEnum('email_template', e.emailTemplates);
export const emailStatusEnum = pgEnum('email_status', e.emailStatuses);
export const llmTaskEnum = pgEnum('llm_task', e.llmTasks);
