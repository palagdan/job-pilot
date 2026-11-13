import type { CvContent } from '@job-pilot/shared/cv';
import type { ExperienceBand } from '@job-pilot/shared/enums';
import { limits } from '@job-pilot/shared/limits';

export type ProfileFromCv = {
  fullName: string | null;
  currentTitle: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
  skills: string[];
  languages: CvContent['languages'];
  experience: ExperienceBand | null;
  proofs: string[];
};

const orNull = (value: string | null | undefined) => value?.trim() || null;

const normaliseUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const monthIndex = (yearMonth: string) => {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  return year * 12 + (month - 1);
};

const experienceBand = (cv: CvContent, now: Date): ExperienceBand | null => {
  const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const dated = cv.experience.filter((e) => e.start);
  if (dated.length === 0) return null;
  const start = Math.min(...dated.map((e) => monthIndex(e.start as string)));
  const end = Math.max(...dated.map((e) => (e.end ? monthIndex(e.end) : nowIndex)));
  const months = end - start;
  if (months < 12) return 'lt_1';
  if (months < 36) return '1_3';
  if (months < 60) return '3_5';
  if (months < 120) return '5_10';
  return '10_plus';
};

const mostRecentTitle = (cv: CvContent) => {
  const rank = (e: CvContent['experience'][number]) => e.end ?? '9999-99';
  const sorted = [...cv.experience].sort((a, b) => rank(b).localeCompare(rank(a)));
  return sorted.find((e) => e.title.trim())?.title;
};

const pickSkills = (skills: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim();
    const key = skill.toLowerCase();
    if (skill.length < limits.tag.min || skill.length > limits.tag.max || seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
    if (result.length === limits.skills.max) break;
  }
  return result;
};

const pickProofs = (projects: CvContent['projects']) =>
  projects
    .map((p) => {
      const name = p.name.trim();
      const description = p.description.trim();
      return (description ? `${name} — ${description}` : name).slice(0, limits.proofItems.textMax);
    })
    .filter((text) => text.length > 0)
    .slice(0, limits.proofItems.max);

export const profileFromCv = (cv: CvContent, now: Date): ProfileFromCv => {
  const links = cv.header.links
    .map((l) => normaliseUrl(l.url))
    .filter((url): url is string => url !== null);
  const linkedinUrl = links.find((url) => url.toLowerCase().includes('linkedin.com')) ?? null;
  const portfolioUrl = links.find((url) => !url.toLowerCase().includes('linkedin.com')) ?? null;

  return {
    fullName: orNull(cv.header.fullName),
    currentTitle: orNull(cv.header.headline) ?? orNull(mostRecentTitle(cv)),
    location: orNull(cv.header.location),
    linkedinUrl,
    portfolioUrl,
    summary: orNull(cv.summary),
    skills: pickSkills(cv.skills),
    languages: cv.languages,
    experience: experienceBand(cv, now),
    proofs: pickProofs(cv.projects),
  };
};
