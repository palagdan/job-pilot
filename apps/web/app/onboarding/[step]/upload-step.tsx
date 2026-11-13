'use client';

import { messages } from '@job-pilot/shared/limits';
import { linkedinUrlSchema, portfolioUrlSchema } from '@job-pilot/shared/profile';
import type { Upload } from '@job-pilot/shared/upload';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { Dropzone, type DropzoneState } from '../../../components/ui/dropzone.tsx';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { TextInput } from '../../../components/ui/text-input.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { uploadCvWithProgress } from '../../../lib/api/upload-cv.ts';
import { onboardingPath } from '../../../lib/onboarding/steps.ts';
import styles from '../onboarding.module.css';
import stepStyles from './upload-step.module.css';

const pollMs = 1500;
const isReading = (upload: Upload) => upload.parseStatus !== 'parsed' && upload.parseStatus !== 'failed';

/** Empty → null (optional). Adds https:// when the user leaves it out. Returns an error message or null. */
const checkLink = (raw: string, kind: 'linkedin' | 'portfolio'): { value: string | null; error: string | null } => {
  const text = raw.trim();
  if (!text) return { value: null, error: null };
  const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const fail = { value: null, error: kind === 'linkedin' ? messages.linkedinUrl : messages.portfolioUrl };
  if (!/^https?:\/\//i.test(value)) return fail;
  const schema = kind === 'linkedin' ? linkedinUrlSchema : portfolioUrlSchema;
  return schema.safeParse(value).success ? { value, error: null } : fail;
};

/** Onboarding step 1 (spec §5): CV dropzone with parse polling, optional LinkedIn / portfolio links, Continue. */
export function UploadStep() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Current upload: resumable after a reload; polls while the worker reads the CV.
  const current = useQuery({
    queryKey: queryKeys.currentUpload,
    queryFn: ({ signal }) => callApi('getCurrentUpload', { signal }),
    refetchInterval: (query) => {
      const upload = query.state.data;
      return upload && isReading(upload) ? pollMs : false;
    },
  });
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => callApi('getProfile', { signal }),
  });
  const upload = current.data ?? null;

  const [sending, setSending] = useState<{ filename: string; progress: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const send = async (file: File) => {
    setProblem(null);
    setSending({ filename: file.name, progress: 0 });
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const created = await uploadCvWithProgress(file, {
        replace: upload !== null,
        signal: controller.signal,
        onProgress: (progress) => setSending({ filename: file.name, progress }),
      });
      queryClient.setQueryData(queryKeys.currentUpload, created);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setProblem(error instanceof ApiError ? error.message : messages.cvUnreadable);
    } finally {
      setSending(null);
    }
  };

  const dropzoneState: DropzoneState = sending
    ? sending.progress >= 100
      ? { kind: 'reading' }
      : { kind: 'uploading', ...sending }
    : problem
      ? { kind: 'error', message: problem }
      : upload?.parseStatus === 'failed'
        ? { kind: 'error', message: upload.parseError ?? messages.cvUnreadable }
        : upload && isReading(upload)
          ? { kind: 'reading' }
          : upload
            ? { kind: 'done', filename: upload.filename, pageCount: upload.pageCount }
            : { kind: 'idle' };

  const loading = current.isPending;
  const showSkeleton = useDelayedFlag(loading);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Upload your CV</h2>
      <p className={styles.muted}>JobPilot reads it to pre-fill your profile. Add your links if you have them.</p>

      {loading ? (
        showSkeleton ? <Skeleton height={150} radius="12px" /> : <div style={{ height: 150 }} />
      ) : (
        <Dropzone
          state={dropzoneState}
          onFile={send}
          onReject={(message) => {
            setProblem(message);
          }}
        />
      )}
      {current.isError && !upload && (
        <p className={styles.muted} role="alert">
          We could not load your CV status. Reload the page to try again.
        </p>
      )}

      {profile.isPending ? (
        <Skeleton height={120} radius="12px" />
      ) : (
        <LinksForm
          key="links"
          initial={{ linkedinUrl: profile.data?.linkedinUrl ?? '', portfolioUrl: profile.data?.portfolioUrl ?? '' }}
          cvReady={upload?.parseStatus === 'parsed' && !sending}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.me });
            queryClient.invalidateQueries({ queryKey: queryKeys.profile });
            router.push(onboardingPath('confirm_profile'));
          }}
        />
      )}
    </section>
  );
}

function LinksForm({
  initial,
  cvReady,
  onSaved,
}: {
  initial: { linkedinUrl: string; portfolioUrl: string };
  cvReady: boolean;
  onSaved: () => Promise<void>;
}) {
  const [linkedin, setLinkedin] = useState(initial.linkedinUrl);
  const [portfolio, setPortfolio] = useState(initial.portfolioUrl);
  const [errors, setErrors] = useState<{ linkedin: string | null; portfolio: string | null }>({ linkedin: null, portfolio: null });

  const save = useMutation({
    mutationFn: (body: { linkedinUrl: string | null; portfolioUrl: string | null }) => callApi('saveOnboardingLinks', { body }),
    onSuccess: onSaved,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save. Try again.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const li = checkLink(linkedin, 'linkedin');
    const pf = checkLink(portfolio, 'portfolio');
    setErrors({ linkedin: li.error, portfolio: pf.error });
    if (li.error || pf.error || !cvReady) return;
    save.mutate({ linkedinUrl: li.value, portfolioUrl: pf.value });
  };

  return (
    <form className={stepStyles.links} onSubmit={submit} noValidate>
      <TextInput
        label="LinkedIn URL (optional)"
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://www.linkedin.com/in/your-name"
        value={linkedin}
        error={errors.linkedin}
        onChange={(e) => {
          setLinkedin(e.target.value);
          if (errors.linkedin) setErrors((s) => ({ ...s, linkedin: null }));
        }}
        onBlur={() => setErrors((s) => ({ ...s, linkedin: checkLink(linkedin, 'linkedin').error }))}
      />
      <TextInput
        label="GitHub or portfolio URL (optional)"
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://github.com/your-name"
        value={portfolio}
        error={errors.portfolio}
        onChange={(e) => {
          setPortfolio(e.target.value);
          if (errors.portfolio) setErrors((s) => ({ ...s, portfolio: null }));
        }}
        onBlur={() => setErrors((s) => ({ ...s, portfolio: checkLink(portfolio, 'portfolio').error }))}
      />
      <div className={stepStyles.actions}>
        <Button
          type="submit"
          variant="primary"
          disabled={!cvReady}
          disabledReason={messages.cvRequired}
          loading={save.isPending}
          loadingLabel="Saving..."
        >
          Continue
        </Button>
      </div>
    </form>
  );
}
