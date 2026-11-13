import type { CvContent } from '@job-pilot/shared/cv';
import {
  contactLine,
  educationLine,
  formatLanguages,
  formatPeriod,
  roleLine,
  sectionTitles,
} from '@job-pilot/shared/cv-format';
import styles from './cv-preview.module.css';

export type LineMark = 'added' | 'removed';

/**
 * HTML preview of a CV, the same content and order as the PDF/DOCX (shared formatting).
 * `mark` highlights lines for the compare view (added = only on this side).
 */
export function CvPreview({
  content,
  mark,
  label,
}: {
  content: CvContent;
  mark?: (line: string) => LineMark | undefined;
  label?: string;
}) {
  const m = (line: string) => mark?.(line);
  const contact = contactLine(content.header);
  return (
    <article className={styles.page} aria-label={label ?? `CV of ${content.header.fullName}`}>
      <header>
        <p className={styles.name}>{content.header.fullName}</p>
        {content.header.headline && (
          <p className={styles.headline} data-mark={m(content.header.headline)}>
            {content.header.headline}
          </p>
        )}
        {contact && <p className={styles.meta}>{contact}</p>}
      </header>

      {content.summary && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.summary}</h3>
          <p data-mark={m(content.summary)}>{content.summary}</p>
        </section>
      )}

      {content.experience.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.experience}</h3>
          {content.experience.map((e) => (
            <div key={`${e.company}-${e.title}-${e.start}`} className={styles.item}>
              <div className={styles.itemHead}>
                <p className={styles.itemTitle} data-mark={m(roleLine(e.title, e.company))}>
                  {roleLine(e.title, e.company)}
                </p>
                <p className={styles.meta}>{formatPeriod(e.start, e.end)}</p>
              </div>
              {e.location && <p className={styles.meta}>{e.location}</p>}
              <ul className={styles.bullets}>
                {e.bullets.map((b) => (
                  <li key={b} data-mark={m(b)}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.education.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.education}</h3>
          {content.education.map((e) => (
            <div key={`${e.school}-${e.start}`} className={styles.itemHead}>
              <p className={styles.itemTitle}>{educationLine(e)}</p>
              <p className={styles.meta}>{formatPeriod(e.start, e.end)}</p>
            </div>
          ))}
        </section>
      )}

      {content.skills.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.skills}</h3>
          <p>
            {content.skills.map((s, i) => (
              <span key={s} data-mark={m(`skill:${s}`)}>
                {s}
                {i < content.skills.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </section>
      )}

      {content.languages.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.languages}</h3>
          <p>{formatLanguages(content.languages)}</p>
        </section>
      )}

      {content.projects.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionTitles.projects}</h3>
          {content.projects.map((p) => (
            <div key={p.name} className={styles.item}>
              <p className={styles.itemTitle}>{p.url ? `${p.name} — ${p.url}` : p.name}</p>
              {p.description && <p data-mark={m(p.description)}>{p.description}</p>}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

/** Comparable lines of a CV (headline, summary, roles, bullets, skills, project texts) for the compare view. */
export const cvLines = (c: CvContent): Set<string> =>
  new Set([
    c.header.headline,
    c.summary,
    ...c.experience.flatMap((e) => [roleLine(e.title, e.company), ...e.bullets]),
    ...c.skills.map((s) => `skill:${s}`),
    ...c.projects.map((p) => p.description),
  ]);
