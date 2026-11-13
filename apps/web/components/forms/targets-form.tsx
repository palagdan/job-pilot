'use client';

import { type WorkFormat, workFormats } from '@job-pilot/shared/enums';
import { limits, messages } from '@job-pilot/shared/limits';
import { type suggestionKinds, type TargetsView, targetsDefaults } from '@job-pilot/shared/targets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { ChipGroup } from '../ui/chip.tsx';
import { TagInput } from '../ui/tag-input.tsx';
import { toast } from '../ui/toast.tsx';
import { Toggle } from '../ui/toggle.tsx';
import type { SaveFormProps } from './form-props.ts';
import { ApiError, callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import formStyles from './targets-form.module.css';

const workFormatLabels: Record<WorkFormat, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const workFormatOptions = workFormats.map((value) => ({ value, label: workFormatLabels[value] }));

/** Locations the spec calls out; shown even when the suggestions endpoint is unavailable. */
const fallbackLocations = ['Remote EU', 'Remote worldwide'];

type FormState = TargetsView;
type Errors = Record<string, string>;

const validateField = (key: string, s: FormState): string | null => {
  switch (key) {
    case 'roles':
      return s.roles.length >= 1 ? null : messages.rolesRequired;
    case 'locations':
      return s.locations.length >= 1 ? null : messages.locationsRequired;
    case 'workFormats':
      return s.workFormats.length >= 1 ? null : messages.workFormatRequired;
    case 'exclusions':
      return s.exclusions.length <= limits.exclusions.max ? null : messages.tagLimit(limits.exclusions.max, 'exclusions');
    case 'findJobs':
      return s.findJobs || s.findEvents ? null : messages.lookForRequired;
    default:
      return null;
  }
};
const allKeys = ['roles', 'locations', 'workFormats', 'exclusions', 'findJobs'];

const unselected = (items: readonly string[] | undefined, chosen: string[]) => {
  const taken = new Set(chosen.map((c) => c.toLowerCase()));
  return (items ?? []).filter((i) => !taken.has(i.toLowerCase())).slice(0, 8);
};

/** Suggestions for one tag field. A failing or missing endpoint (404, offline) just means no suggestions. */
const useSuggestions = (kind: (typeof suggestionKinds)[number], q: string) =>
  useQuery({
    queryKey: ['suggestions', kind, q],
    queryFn: ({ signal }) => callApi('getSuggestions', { query: { kind, q }, signal }),
    select: (data) => data.items,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });


export function TargetsForm({
  targets,
  onSaved,
  submitLabel = 'Continue',
  loadingLabel = 'Saving...',
  footer,
}: { targets: TargetsView } & SaveFormProps<TargetsView>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FormState>(() => ({
    ...targets,
    workFormats: targets.workFormats.length ? targets.workFormats : [...targetsDefaults.workFormats],
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [roleQuery, setRoleQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);

  const roleBase = useSuggestions('roles', '');
  const roleTyped = useSuggestions('roles', roleQuery.trim());
  const locationBase = useSuggestions('locations', '');
  const locationTyped = useSuggestions('locations', locationQuery.trim());

  const patch = (changes: Partial<FormState>, clearKeys: string[] = []) => {
    setState((s) => ({ ...s, ...changes }));
    if (clearKeys.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clearKeys.includes(k))));
  };
  const blur = (key: string, next: FormState = state) => setErrors((e) => ({ ...e, [key]: validateField(key, next) ?? '' }));
  const errorOf = (key: string) => errors[key] || null;

  const save = useMutation({
    // PUT /v1/targets validates + saves targets (during onboarding it also advances to the schedule step).
    mutationFn: async (body: FormState) => {
      const saved = await callApi('putTargets', { body });
      queryClient.setQueryData(queryKeys.targets, saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      await onSaved?.(saved);
      return saved;
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
    for (const key of allKeys) {
      const message = validateField(key, state);
      if (message) found[key] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    save.mutate(state);
  };

  const roleChips = unselected(roleBase.data, state.roles);
  const locationChips = unselected(
    [...fallbackLocations, ...(locationBase.data ?? []).filter((l) => !fallbackLocations.includes(l))],
    state.locations,
  );

  const addRole = (role: string) => {
    if (state.roles.length >= limits.roles.max) return toast.error(messages.tagLimit(limits.roles.max, 'roles'));
    patch({ roles: [...state.roles, role] }, ['roles']);
  };
  const addLocation = (location: string) => {
    if (state.locations.length >= limits.locations.max) return toast.error(messages.tagLimit(limits.locations.max, 'locations'));
    patch({ locations: [...state.locations, location] }, ['locations']);
  };

  return (
    <form ref={formRef} className={formStyles.form} onSubmit={submit} noValidate>
      <div className={formStyles.field}>
        <TagInput
          label="Target roles"
          hint="Press Enter or comma to add a role."
          value={state.roles}
          onChange={(roles) => patch({ roles }, ['roles'])}
          suggestions={[...(roleTyped.data ?? []), ...(roleBase.data ?? [])]}
          onQueryChange={setRoleQuery}
          max={limits.roles.max}
          itemName="roles"
          placeholder="For example Product Designer"
          error={errorOf('roles')}
        />
        {roleChips.length > 0 && (
          <div className={formStyles.suggested}>
            <span className={formStyles.suggestedLabel}>Suggestions</span>
            <ChipGroup
              type="multiple"
              label="Suggested roles"
              options={roleChips.map((r) => ({ value: r, label: r }))}
              value={[]}
              onChange={(picked) => picked[0] && addRole(picked[0])}
            />
          </div>
        )}
      </div>

      <div className={formStyles.field}>
        <TagInput
          label="Locations"
          hint="City, country or remote region."
          value={state.locations}
          onChange={(locations) => patch({ locations }, ['locations'])}
          suggestions={[...(locationTyped.data ?? []), ...(locationBase.data ?? []), ...fallbackLocations]}
          onQueryChange={setLocationQuery}
          max={limits.locations.max}
          itemName="locations"
          placeholder="For example Prague"
          error={errorOf('locations')}
        />
        {locationChips.length > 0 && (
          <ChipGroup
            type="multiple"
            label="Suggested locations"
            options={locationChips.map((l) => ({ value: l, label: l }))}
            value={[]}
            onChange={(picked) => picked[0] && addLocation(picked[0])}
          />
        )}
      </div>

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>Work format</legend>
        <ChipGroup
          type="multiple"
          label="Work format"
          options={workFormatOptions}
          value={state.workFormats}
          minSelected={1}
          onChange={(formats) => patch({ workFormats: formats }, ['workFormats'])}
        />
        {errorOf('workFormats') && (
          <p className={formStyles.error} role="alert">
            {errorOf('workFormats')}
          </p>
        )}
      </fieldset>

      <TagInput
        label="Exclusions (optional)"
        hint="Companies, industries or keywords to skip. Press Enter or comma to add."
        value={state.exclusions}
        onChange={(exclusions) => patch({ exclusions }, ['exclusions'])}
        max={limits.exclusions.max}
        itemName="exclusions"
        placeholder="For example Gambling"
        error={errorOf('exclusions')}
      />

      <fieldset className={formStyles.group}>
        <legend className={formStyles.groupTitle}>What to look for</legend>
        <Toggle
          label="Jobs"
          description="Open roles that match your targets."
          checked={state.findJobs}
          onCheckedChange={(findJobs) => {
            const next = { ...state, findJobs };
            patch({ findJobs }, ['findJobs']);
            blur('findJobs', next);
          }}
        />
        <Toggle
          label="Events"
          description="Meetups and conferences worth attending."
          checked={state.findEvents}
          onCheckedChange={(findEvents) => {
            const next = { ...state, findEvents };
            patch({ findEvents }, ['findJobs']);
            blur('findJobs', next);
          }}
        />
        {errorOf('findJobs') && (
          <p className={formStyles.error} role="alert">
            {errorOf('findJobs')}
          </p>
        )}
      </fieldset>

      <div className={formStyles.actions}>
        {footer ?? <span />}
        <Button type="submit" variant="primary" loading={save.isPending} loadingLabel={loadingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
