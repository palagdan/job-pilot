import { createRequire } from 'node:module';
import type { CvContent } from '@job-pilot/shared/cv';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import {
  contactLine,
  educationLine,
  formatLanguages,
  formatPeriod,
  roleLine,
  sectionTitles,
} from './format.ts';

/**
 * PDF renderer (React-PDF, no JSX so Node can run this file directly). One column, real text, standard section
 * headings, no tables or images — readable by ATS parsers. Inter is embedded (full Latin Extended: č, ř, ň, ł…);
 * React-PDF's built-in fonts are Latin-1 only.
 */
const require = createRequire(import.meta.url);
const font = (file: string) => require.resolve(`@expo-google-fonts/inter/${file}`);

Font.register({
  family: 'Inter',
  fonts: [
    { src: font('400Regular/Inter_400Regular.ttf'), fontWeight: 400 },
    { src: font('600SemiBold/Inter_600SemiBold.ttf'), fontWeight: 600 },
    { src: font('700Bold/Inter_700Bold.ttf'), fontWeight: 700 },
  ],
});
// No automatic hyphenation: ATS parsers and people both prefer whole words.
Font.registerHyphenationCallback((word) => [word]);

const ink = '#0b0d12';
const muted = '#5f6672';
const line = '#e4e7ec';

const s = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 48,
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 1.4,
    color: ink,
  },
  name: { fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
  headline: { fontSize: 11.5, fontWeight: 600, marginTop: 2 },
  contact: { fontSize: 9, color: muted, marginTop: 4 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingBottom: 3,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: line,
  },
  item: { marginBottom: 8 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between' },
  itemTitle: { fontWeight: 600, flexShrink: 1, paddingRight: 12 },
  itemMeta: { color: muted, fontSize: 9 },
  bullet: { flexDirection: 'row', marginTop: 2 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
});

const section = (title: string, children: (ReactElement | null)[]) =>
  h(View, { style: s.section, key: title }, h(Text, { style: s.sectionTitle }, title), ...children);

const cvDocument = (cv: CvContent) => {
  const contact = contactLine(cv.header);
  return h(
    Document,
    {
      title: `${cv.header.fullName} — CV`,
      author: cv.header.fullName,
      creator: 'JobPilot',
      producer: 'JobPilot',
    },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(Text, { style: s.name }, cv.header.fullName),
      cv.header.headline ? h(Text, { style: s.headline }, cv.header.headline) : null,
      contact ? h(Text, { style: s.contact }, contact) : null,

      cv.summary ? section(sectionTitles.summary, [h(Text, { key: 'summary' }, cv.summary)]) : null,

      cv.experience.length
        ? section(
            sectionTitles.experience,
            cv.experience.map((e, i) =>
              h(
                View,
                { style: s.item, key: `exp-${i}`, wrap: false },
                h(
                  View,
                  { style: s.itemHead },
                  h(Text, { style: s.itemTitle }, roleLine(e.title, e.company)),
                  h(Text, { style: s.itemMeta }, formatPeriod(e.start, e.end)),
                ),
                e.location ? h(Text, { style: s.itemMeta }, e.location) : null,
                ...e.bullets.map((b, j) =>
                  h(
                    View,
                    { style: s.bullet, key: `b-${j}` },
                    h(Text, { style: s.bulletDot }, '•'),
                    h(Text, { style: s.bulletText }, b),
                  ),
                ),
              ),
            ),
          )
        : null,

      cv.education.length
        ? section(
            sectionTitles.education,
            cv.education.map((e, i) =>
              h(
                View,
                { style: s.itemHead, key: `edu-${i}` },
                h(Text, { style: s.itemTitle }, educationLine(e)),
                h(Text, { style: s.itemMeta }, formatPeriod(e.start, e.end)),
              ),
            ),
          )
        : null,

      cv.skills.length
        ? section(sectionTitles.skills, [h(Text, { key: 'skills' }, cv.skills.join(', '))])
        : null,
      cv.languages.length
        ? section(sectionTitles.languages, [
            h(Text, { key: 'languages' }, formatLanguages(cv.languages)),
          ])
        : null,
      cv.projects.length
        ? section(
            sectionTitles.projects,
            cv.projects.map((p, i) =>
              h(
                View,
                { style: s.item, key: `proj-${i}` },
                h(Text, { style: s.itemTitle }, p.url ? `${p.name} — ${p.url}` : p.name),
                p.description ? h(Text, null, p.description) : null,
              ),
            ),
          )
        : null,
    ),
  );
};

/** Renders the CV to PDF bytes; `pageCount` from the generated page objects. */
export async function renderCvPdf(
  cv: CvContent,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const buffer = await renderToBuffer(cvDocument(cv));
  const pageCount = (buffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length || 1;
  return { bytes: new Uint8Array(buffer), pageCount };
}
