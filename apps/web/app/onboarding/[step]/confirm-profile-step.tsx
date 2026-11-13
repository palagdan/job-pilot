'use client';

import {
  type ExperienceBand,
  experienceBands,
  type LanguageLevel,
  languageLevels,
  type NoticePeriod,
  noticePeriods,
  type SalaryPeriod,
} from '@job-pilot/shared/enums';
import { limits, messages } from '@job-pilot/shared/limits';
import type { Profile, ProfileInput } from '@job-pilot/shared/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { TagInput } from '../../../components/ui/tag-input.tsx';
import { TextInput } from '../../../components/ui/text-input.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { onboardingPath } from '../../../lib/onboarding/steps.ts';
import styles from '../onboarding.module.css';
import formStyles from './confirm-profile-step.module.css';

const experienceLabels: Record<ExperienceBand, string> = {
  lt_1: 'Less than 1 year',
  '1_3': '1–3 years',
  '3_5': '3–5 years',
  '5_10': '5–10 years',
  '10_plus': '10+ years',
};
const noticeLabels: Record<NoticePeriod, string> = {
  immediately: 'Immediately',
  '2_weeks': '2 weeks',
  '1_month': '1 month',
  '2_months': '2 months',
  '3_months': '3 months',
  more: 'More than 3 months',
};
const levelLabels: Record<LanguageLevel, string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  professional: 'Professional',
  native: 'Native',
};
const periodLabels: Record<SalaryPeriod, string> = { month: 'per month', year: 'per year' };
const baseCurrencies = ['CZK', 'EUR'];

const toOptions = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

type Row = { key: string; text: string; id?: string };
type LanguageRow = { key: string; language: string; level: LanguageLevel };
type Errors = Record<string, string>;

const nextKey = (() => {
  let n = 0;
  return () => `row-${++n}`;
})();

type FormState = {
  fullName: string;
  currentTitle: string;
  experience: ExperienceBand | undefined;
  location: string;
  skills: string[];
  salaryMin: string;
  salaryMax: string;
  currency: string;
  period: SalaryPeriod;
  noticePeriod: NoticePeriod | undefined;
  languages: LanguageRow[];
  proof: Row[];
};

const initialState = (profile: Profile): FormState => ({
  fullName: profile.fullName ?? '',
  currentTitle: profile.currentTitle ?? '',
  experience: profile.experience ?? undefined,
  location: profile.location ?? '',
  skills: profile.skills,
  salaryMin: profile.salary ? String(profile.salary.min) : '',
  salaryMax: profile.salary?.max ? String(profile.salary.max) : '',
  currency: profile.salary?.currency ?? 'CZK',
  period: profile.salary?.period ?? 'month',
  noticePeriod: profile.noticePeriod ?? undefined,
  languages: profile.languages.map((l) => ({ key: nextKey(), language: l.language, level: l.level })),
  proof: profile.proof.map((p) => ({ key: nextKey(), text: p.text, id: p.id })),
});

const parseAmount = (raw: string): number | null => {
  const text = raw.replace(/[\s,]/g, '');
  return /^\d+$/.test(text) ? Number(text) : null;
};

/** Validates one field; returns an error message or null. Keys match the api's `fields` map. */
const validateField = (key: string, s: FormState): string | null => {
  switch (key) {
    case 'fullName':
      return s.fullName.trim() ? null : messages.fullNameRequired;
    case 'currentTitle':
      return s.currentTitle.trim() ? null : messages.titleRequired;
    case 'experience':
      return s.experience ? null : messages.experienceRequired;
    case 'location':
      return s.location.trim() ? null : messages.locationRequired;
    case 'salary.min': {
      if (!s.salaryMin.trim() && !s.salaryMax.trim()) return null;
      const min = parseAmount(s.salaryMin);
      return min && min > 0 ? null : 'Enter a monthly or yearly amount, for example 90000.';
    }
    case 'salary.max': {
      if (!s.salaryMax.trim()) return null;
      const max = parseAmount(s.salaryMax);
      if (!max || max <= 0) return 'Enter a number, for example 120000.';
      const min = parseAmount(s.salaryMin);
      return min && max < min ? 'Max must be at least min.' : null;
    }
    default: {
      const language = /^languages\.(\d+)\.language$/.exec(key);
      if (language) {
        const text = s.languages[Number(language[1])]?.language.trim() ?? '';
        return text.length >= limits.tag.min && text.length <= limits.tag.max ? null : messages.tagLength;
      }
      const proof = /^proof\.(\d+)\.text$/.exec(key);
      if (proof) {
        const text = s.proof[Number(proof[1])]?.text.trim() ?? '';
        if (!text) return 'Enter text or remove this item.';
        return text.length <= limits.proofItems.textMax ? null : `Keep it under ${limits.proofItems.textMax} characters.`;
      }
      return null;
    }
  }
};

const allKeys = (s: FormState) => [
  'fullName',
  'currentTitle',
  'experience',
  'location',
  'salary.min',
  'salary.max',
  ...s.languages.map((_, i) => `languages.${i}.language`),
  ...s.proof.map((_, i) => `proof.${i}.text`),
];

/** Onboarding step 2 (spec §5): confirm the profile pre-filled from the CV, then Continue to targets. */
export function ConfirmProfileStep() {
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => callApi('getProfile', { signal }),
    // The form owns its state after the first load; refetching must not overwrite edits.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const showSkeleton = useDelayedFlag(profile.isPending);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Confirm your profile</h2>
      <p className={styles.muted}>We pre-filled this from your CV. Check it and fix anything that is off.</p>
      {profile.isPending ? (
        showSkeleton ? (
          <div className={formStyles.form}>
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={120} radius="12px" />
          </div>
        ) : (
          <div style={{ height: 400 }} />
        )
      ) : profile.isError ? (
        <p className={styles.muted} role="alert">
          We could not load your profile. Reload the page to try again.
        </p>
      ) : (
        <ProfileForm profile={profile.data} />
      )}
    </section>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => initialState(profile));
  const [errors, setErrors] = useState<Errors>({});
  const formRef = useRef<HTMLFormElement | null>(null);

  const patch = (changes: Partial<FormState>) => setState((s) => ({ ...s, ...changes }));
  const clear = (key: string) => setErrors((e) => (e[key] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const blur = (key: string, next: FormState = state) => setErrors((e) => ({ ...e, [key]: validateField(key, next) ?? '' }));
  const errorOf = (key: string) => errors[key] || null;

  const save = useMutation({
    // One call: PUT /v1/profile saves the profile + proof, confirms it and advances onboarding to the targets step.
    mutationFn: (body: ProfileInput) => callApi('putProfile', { body }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKeys.profile, saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.push(onboardingPath('set_targets'));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors((e) => ({ ...e, ...error.fields }));
        toast.error(error.message);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not save. Try again.');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    for (const key of allKeys(state)) {
      const message = validateField(key, state);
      if (message) found[key] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Errors render after this state update; focus the first invalid control on the next frame.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const min = parseAmount(state.salaryMin);
    const max = parseAmount(state.salaryMax);
    save.mutate({
      fullName: state.fullName.trim(),
      currentTitle: state.currentTitle.trim(),
      experience: state.experience as ExperienceBand,
      location: state.location.trim(),
      linkedinUrl: profile.linkedinUrl,
      portfolioUrl: profile.portfolioUrl,
      skills: state.skills,
      salary: min ? { min, max: max ?? null, currency: state.currency, period: state.period } : null,
      noticePeriod: state.noticePeriod ?? null,
      languages: state.languages.map((l) => ({ language: l.language.trim(), level: l.level })),
      proof: state.proof.map((p) => ({ ...(p.id ? { id: p.id } : {}), text: p.text.trim() })),
    });
  };

  const currencies = baseCurrencies.includes(state.currency) ? baseCurrencies : [...baseCurrencies, state.currency];

  return (
    <form ref={formRef} className={formStyles.form} onSubmit={submit} noValidate>
      <TextInput
        label="Full name"
        autoComplete="name"
        maxLength={limits.fullName.max}
        value={state.fullName}
        error={errorOf('fullName')}
        onChange={(e) => {
          patch({ fullName: e.target.value });
          clear('fullName');
        }}
        onBlur={() => blur('fullName')}
      />
      <div className={formStyles.row}>
        <TextInput
          label="Current or last job title"
          autoComplete="organization-title"
          maxLength={limits.title.max}
          value={state.currentTitle}
          error={errorOf('currentTitle')}
          onChange={(e) => {
            patch({ currentTitle: e.target.value });
            clear('currentTitle');
          }}
          onBlur={() => blur('currentTitle')}
        />
        <Select
          label="Experience"
          options={toOptions(experienceBands, experienceLabels)}
          value={state.experience}
          error={errorOf('experience')}
          onValueChange={(value) => {
            patch({ experience: value as ExperienceBand });
            clear('experience');
          }}
        />
      </div>
      <TextInput
        label="Location"
        autoComplete="address-level2"
        placeholder="City or country"
        maxLength={limits.location.max}
        value={state.location}
        error={errorOf('location')}
        onChange={(e) => {
          patch({ location: e.target.value });
          clear('location');
        }}
        onBlur={() => blur('location')}
      />
      <TagInput
        label="Skills"
        hint="Press Enter or comma to add a skill."
        value={state.skills}
        onChange={(skills) => patch({ skills })}
        max={limits.skills.max}
        itemName="skills"
        placeholder="For example TypeScript"
        error={errorOf('skills')}
      />

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Salary expectation (optional)</legend>
        <div className={formStyles.salary}>
          <TextInput
            label="Min"
            inputMode="numeric"
            placeholder="90000"
            value={state.salaryMin}
            error={errorOf('salary.min')}
            onChange={(e) => {
              patch({ salaryMin: e.target.value });
              clear('salary.min');
              clear('salary.max');
            }}
            onBlur={() => {
              blur('salary.min');
              blur('salary.max');
            }}
          />
          <TextInput
            label="Max"
            inputMode="numeric"
            placeholder="120000"
            value={state.salaryMax}
            error={errorOf('salary.max')}
            onChange={(e) => {
              patch({ salaryMax: e.target.value });
              clear('salary.max');
            }}
            onBlur={() => blur('salary.max')}
          />
          <Select
            label="Currency"
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={state.currency}
            onValueChange={(currency) => patch({ currency })}
          />
          <Select
            label="Period"
            options={toOptions(['month', 'year'] as const, periodLabels)}
            value={state.period}
            onValueChange={(period) => patch({ period: period as SalaryPeriod })}
          />
        </div>
      </fieldset>

      <Select
        label="Notice period (optional)"
        options={toOptions(noticePeriods, noticeLabels)}
        value={state.noticePeriod}
        onValueChange={(value) => patch({ noticePeriod: value as NoticePeriod })}
        placeholder="Select notice period"
      />

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Languages (optional)</legend>
        {state.languages.map((row, index) => (
          <div key={row.key} className={formStyles.language}>
            <TextInput
              aria-label={`Language ${index + 1}`}
              placeholder="For example English"
              maxLength={limits.tag.max}
              value={row.language}
              error={errorOf(`languages.${index}.language`)}
              onChange={(e) => {
                patch({ languages: state.languages.map((l) => (l.key === row.key ? { ...l, language: e.target.value } : l)) });
                clear(`languages.${index}.language`);
              }}
              onBlur={() => blur(`languages.${index}.language`)}
            />
            <Select
              label={undefined}
              options={toOptions(languageLevels, levelLabels)}
              value={row.level}
              onValueChange={(level) =>
                patch({ languages: state.languages.map((l) => (l.key === row.key ? { ...l, level: level as LanguageLevel } : l)) })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove language ${index + 1}`}
              onClick={() => {
                patch({ languages: state.languages.filter((l) => l.key !== row.key) });
                setErrors({});
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          className={formStyles.addRow}
          disabled={state.languages.length >= limits.languages.max}
          disabledReason={messages.tagLimit(limits.languages.max, 'languages')}
          onClick={() => patch({ languages: [...state.languages, { key: nextKey(), language: '', level: 'professional' }] })}
        >
          Add language
        </Button>
      </fieldset>

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Projects and proof (optional)</legend>
        {state.proof.map((row, index) => (
          <div key={row.key} className={formStyles.item}>
            <TextInput
              aria-label={`Proof item ${index + 1}`}
              placeholder="A project, result or achievement"
              value={row.text}
              error={errorOf(`proof.${index}.text`)}
              onChange={(e) => {
                patch({ proof: state.proof.map((p) => (p.key === row.key ? { ...p, text: e.target.value } : p)) });
                clear(`proof.${index}.text`);
              }}
              onBlur={() => blur(`proof.${index}.text`)}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove proof item ${index + 1}`}
              onClick={() => {
                patch({ proof: state.proof.filter((p) => p.key !== row.key) });
                setErrors({});
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          className={formStyles.addRow}
          disabled={state.proof.length >= limits.proofItems.max}
          disabledReason={messages.tagLimit(limits.proofItems.max, 'items')}
          onClick={() => patch({ proof: [...state.proof, { key: nextKey(), text: '' }] })}
        >
          Add item
        </Button>
      </fieldset>

      <div className={formStyles.actions}>
        <Link href={onboardingPath('upload')} className={formStyles.back}>
          Back
        </Link>
        <Button type="submit" variant="primary" loading={save.isPending} loadingLabel="Saving...">
          Continue
        </Button>
      </div>
    </form>
  );
}
