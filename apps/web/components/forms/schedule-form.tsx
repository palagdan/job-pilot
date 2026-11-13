'use client';

import { type DayOfWeek, daysOfWeek, type RunFrequency, type RunHour, runFrequencies, runHours } from '@job-pilot/shared/enums';
import { messages } from '@job-pilot/shared/limits';
import { nextRunAt } from '@job-pilot/shared/next-run';
import { type Schedule, type ScheduleInput } from '@job-pilot/shared/schedule';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { SearchableSelect } from '../ui/searchable-select.tsx';
import { Segmented } from '../ui/segmented.tsx';
import { Select } from '../ui/select.tsx';
import { toast } from '../ui/toast.tsx';
import { Toggle } from '../ui/toggle.tsx';
import type { SaveFormProps } from './form-props.ts';
import { ApiError, callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import formStyles from './schedule-form.module.css';
import { notifyError } from '../../lib/errors/notify-error.ts';
import { disablePush, enablePush, PushError, pushFailureMessage } from '../../lib/push/web-push.ts';

const frequencyLabels: Record<RunFrequency, string> = { daily: 'Daily', every_3_days: 'Every 3 days', weekly: 'Weekly' };
const frequencyOptions = runFrequencies.map((value) => ({ value, label: frequencyLabels[value] }));

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayOptions = daysOfWeek.map((d) => ({ value: String(d), label: dayNames[d - 1] ?? '' }));
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourOptions = runHours.map((h) => ({ value: String(h), label: hourLabel(h) }));

const pushDeniedMessage = `${messages.pushBlocked} Then try again.`;

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** IANA names from the browser (plus UTC and the current value when the browser omits them). */
const timeZoneOptions = (current: string) => {
  let names: string[] = [];
  try {
    names = Intl.supportedValuesOf('timeZone');
  } catch {
    names = [];
  }
  const all = new Set([...names, 'UTC', current]);
  return [...all].toSorted().map((tz) => ({ value: tz, label: tz.replaceAll('_', ' '), keywords: [tz] }));
};


type FormState = ScheduleInput;
type Errors = Record<string, string>;

export function ScheduleForm({
  schedule,
  onSaved,
  submitLabel = 'Save',
  loadingLabel = 'Saving...',
  footer,
}: { schedule: Schedule } & SaveFormProps<Schedule>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FormState>(() => ({
    frequency: schedule.frequency,
    runHour: schedule.runHour,
    dayOfWeek: schedule.dayOfWeek,
    // Not saved yet (no next run): the api only knows its default, so use the browser's zone.
    timezone: schedule.nextRunAt ? schedule.timezone : browserTimeZone(),
    notifyEmail: schedule.notifyEmail,
    notifyPush: schedule.notifyPush,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [pushError, setPushError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [now] = useState(() => new Date());

  const patch = (changes: Partial<FormState>, clearKeys: string[] = []) => {
    setState((s) => ({ ...s, ...changes }));
    if (clearKeys.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clearKeys.includes(k))));
  };

  const setFrequency = (frequency: RunFrequency) =>
    patch({ frequency, dayOfWeek: frequency === 'weekly' ? (state.dayOfWeek ?? 1) : null }, ['frequency', 'dayOfWeek']);

  const setPush = async (checked: boolean) => {
    setPushError(null);
    if (!checked) {
      patch({ notifyPush: false });
      void disablePush();
      return;
    }
    setAsking(true);
    try {
      // Permission prompt + service worker + subscription saved on the server (spec: denied → revert + error).
      await enablePush();
      patch({ notifyPush: true });
    } catch (error) {
      patch({ notifyPush: false });
      setPushError(pushFailureMessage(error instanceof PushError ? error.reason : 'failed', pushDeniedMessage));
    } finally {
      setAsking(false);
    }
  };

  const finish = useMutation({
    // PUT /v1/schedule saves the schedule + time zone and computes next_run_at. Onboarding then completes in onSaved.
    mutationFn: async (body: FormState) => {
      const saved = await callApi('putSchedule', { body });
      queryClient.setQueryData(queryKeys.schedule, saved);
      await onSaved?.(saved);
      return saved;
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors((e) => ({ ...e, ...error.fields }));
        toast.error(error.message);
        return;
      }
      notifyError(error, 'Could not finish setup. Try again.');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state.frequency === 'weekly' && state.dayOfWeek === null) {
      setErrors({ dayOfWeek: 'Pick a day for weekly runs.' });
      return;
    }
    finish.mutate(state);
  };

  const zones = timeZoneOptions(state.timezone);
  let preview: string | null = null;
  try {
    const next = nextRunAt({ ...state }, now);
    preview = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: state.timezone,
    }).format(next);
  } catch {
    preview = null;
  }

  return (
    <form className={formStyles.form} onSubmit={submit} noValidate>
      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Frequency</legend>
        <Segmented label="Frequency" options={frequencyOptions} value={state.frequency} onValueChange={setFrequency} />
        {errors.frequency && (
          <p className={formStyles.error} role="alert">
            {errors.frequency}
          </p>
        )}
      </fieldset>

      <div className={formStyles.row}>
        {state.frequency === 'weekly' && (
          <Select
            label="Day of week"
            options={dayOptions}
            value={state.dayOfWeek === null ? undefined : String(state.dayOfWeek)}
            onValueChange={(v) => patch({ dayOfWeek: Number(v) as DayOfWeek }, ['dayOfWeek'])}
            placeholder="Pick a day"
            error={errors.dayOfWeek}
          />
        )}
        <Select
          label="Run time"
          options={hourOptions}
          value={String(state.runHour)}
          onValueChange={(v) => patch({ runHour: Number(v) as RunHour }, ['runHour'])}
          error={errors.runHour}
        />
      </div>

      <SearchableSelect
        label="Time zone"
        options={zones}
        value={state.timezone}
        onValueChange={(timezone) => patch({ timezone }, ['timezone'])}
        placeholder="Select a time zone"
        searchPlaceholder="Search time zones"
        emptyText="No time zone found"
        error={errors.timezone}
      />

      {preview && <p className={formStyles.preview}>Next run: {preview} ({state.timezone.replaceAll('_', ' ')})</p>}

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Notify me by</legend>
        <Toggle
          label="Email"
          description="A short summary after each run."
          checked={state.notifyEmail}
          onCheckedChange={(notifyEmail) => patch({ notifyEmail })}
        />
        <Toggle
          label="Push"
          description="Browser notifications when new matches are ready."
          checked={state.notifyPush}
          disabled={asking}
          onCheckedChange={(checked) => void setPush(checked)}
        />
        {pushError && (
          <p className={formStyles.error} role="alert">
            {pushError}
          </p>
        )}
        {!state.notifyEmail && !state.notifyPush && <p className={formStyles.hint}>{messages.noNotificationsHint}</p>}
      </fieldset>

      <div className={formStyles.actions}>
        {footer ?? <span />}
        <Button type="submit" variant="primary" loading={finish.isPending} loadingLabel={loadingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
