import type { FileFormat } from '@job-pilot/shared/enums';

/** Characters not allowed in file names on Windows/macOS/Linux, plus control characters. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const unsafe = /[\\/:*?"<>|\u0000-\u001f]/g;
const clean = (s: string) => s.replace(unsafe, ' ').replace(/\s+/g, ' ').trim();

/**
 * Spec "Download format" file names (without extension):
 * - master: `Name_CV_JobPilot_v1` (spaces → underscores)
 * - special: `CV - Company - Role`
 */
export const cvFileBaseName = (
  cv:
    | { kind: 'master'; fullName: string | null; version: number }
    | { kind: 'special'; company: string | null; role: string | null },
): string => {
  if (cv.kind === 'master') {
    const name = clean(cv.fullName ?? '').replace(/ /g, '_') || 'My';
    return `${name}_CV_JobPilot_v${cv.version}`;
  }
  return ['CV', clean(cv.company ?? ''), clean(cv.role ?? '')].filter(Boolean).join(' - ');
};

export const cvFileName = (baseName: string, format: FileFormat) => `${baseName}.${format}`;

export const cvContentTypes: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
