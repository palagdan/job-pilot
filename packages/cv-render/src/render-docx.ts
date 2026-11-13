import type { CvContent } from '@job-pilot/shared/cv';
import {
  contactLine,
  educationLine,
  formatLanguages,
  formatPeriod,
  roleLine,
  sectionTitles,
} from '@job-pilot/shared/cv-format';
import { BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from 'docx';

/**
 * DOCX renderer (same content and order as the PDF). Plain paragraphs, real bullets, a right tab stop for dates —
 * no tables or text boxes, which ATS parsers often skip. Arial is available everywhere.
 */
const font = 'Arial';
const muted = '5F6672';
const pageWidthTwips = 11906 - 2 * 1000; // A4 minus margins

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font, size: (opts.size ?? 10) * 2, bold: opts.bold, color: opts.color });

const sectionHeading = (title: string) =>
  new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E4E7EC', space: 2 } },
    children: [run(title.toUpperCase(), { bold: true, size: 9.5 })],
  });

/** Title on the left, dates right-aligned on the same line. */
const headWithDates = (left: string, right: string) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: pageWidthTwips }],
    spacing: { before: 120 },
    children: [
      run(left, { bold: true }),
      ...(right ? [run(`\t${right}`, { size: 9, color: muted })] : []),
    ],
  });

export async function renderCvDocx(cv: CvContent): Promise<{ bytes: Uint8Array }> {
  const children: Paragraph[] = [
    new Paragraph({ children: [run(cv.header.fullName, { bold: true, size: 20 })] }),
  ];
  if (cv.header.headline)
    children.push(
      new Paragraph({ children: [run(cv.header.headline, { bold: true, size: 11.5 })] }),
    );
  const contact = contactLine(cv.header);
  if (contact)
    children.push(new Paragraph({ children: [run(contact, { size: 9, color: muted })] }));

  if (cv.summary)
    children.push(
      sectionHeading(sectionTitles.summary),
      new Paragraph({ children: [run(cv.summary)] }),
    );

  if (cv.experience.length) {
    children.push(sectionHeading(sectionTitles.experience));
    for (const e of cv.experience) {
      children.push(headWithDates(roleLine(e.title, e.company), formatPeriod(e.start, e.end)));
      if (e.location)
        children.push(new Paragraph({ children: [run(e.location, { size: 9, color: muted })] }));
      for (const b of e.bullets)
        children.push(new Paragraph({ bullet: { level: 0 }, children: [run(b)] }));
    }
  }

  if (cv.education.length) {
    children.push(sectionHeading(sectionTitles.education));
    for (const e of cv.education)
      children.push(headWithDates(educationLine(e), formatPeriod(e.start, e.end)));
  }

  if (cv.skills.length)
    children.push(
      sectionHeading(sectionTitles.skills),
      new Paragraph({ children: [run(cv.skills.join(', '))] }),
    );
  if (cv.languages.length) {
    children.push(
      sectionHeading(sectionTitles.languages),
      new Paragraph({ children: [run(formatLanguages(cv.languages))] }),
    );
  }
  if (cv.projects.length) {
    children.push(sectionHeading(sectionTitles.projects));
    for (const p of cv.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [run(p.url ? `${p.name} — ${p.url}` : p.name, { bold: true })],
        }),
      );
      if (p.description) children.push(new Paragraph({ children: [run(p.description)] }));
    }
  }

  const doc = new Document({
    creator: 'JobPilot',
    title: `${cv.header.fullName} — CV`,
    styles: { default: { document: { run: { font, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 800, bottom: 800, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return { bytes: new Uint8Array(buffer) };
}
