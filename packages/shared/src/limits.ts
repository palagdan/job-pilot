/** Field limits from the frontend spec (sections 1, 3, 5). Shared by web validation and api validation. */
export const limits = {
  tag: { min: 2, max: 40 },
  roles: { min: 1, max: 5 },
  locations: { min: 1, max: 5 },
  skills: { min: 0, max: 20 },
  exclusions: { min: 0, max: 10 },
  languages: { min: 0, max: 10 },
  proofItems: { max: 10, textMax: 300 },
  cvUpload: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    extensions: ['.pdf', '.docx'],
  },
  skipNote: { max: 200 },
  noteBody: { max: 2000 },
  chatMessage: { max: 2000 },
  draftBody: { max: 10_000 },
  fullName: { max: 120 },
  title: { max: 120 },
  location: { max: 120 },
  url: { max: 500 },
  /** Undo window for toasts with Undo (Skipped, Marked as sent, ...). */
  undoWindowMs: 10_000,
} as const;

/** Inline validation copy from spec section 5 ("Text is final copy"). */
export const messages = {
  cvRequired: 'Upload a CV to continue.',
  cvTooLarge: 'This file is larger than 5 MB.',
  cvWrongType: 'Only PDF and DOCX files are supported.',
  cvUnreadable: 'We could not read this file. Try a text-based PDF or DOCX.',
  masterCvFailed: 'We could not write your CV. Use your original CV or try again.',
  linkedinUrl: 'Enter a linkedin.com profile link.',
  portfolioUrl: 'Enter a valid link, for example https://github.com/name.',
  fullNameRequired: 'Enter your name.',
  titleRequired: 'Enter your current or last job title.',
  experienceRequired: 'Select your experience.',
  locationRequired: 'Enter a city or country.',
  rolesRequired: 'Add at least one target role.',
  locationsRequired: 'Add at least one location.',
  tagLength: 'Keep tags between 2 and 40 characters.',
  tagLimit: (max: number, what: string) => `You can add up to ${max} ${what}.`,
  workFormatRequired: 'Select at least one work format.',
  lookForRequired: 'Keep at least one type switched on.',
  pushBlocked: 'Notifications are blocked in your browser. Allow them in the browser settings.',
  noNotificationsHint: 'You will only see updates in the app.',
  chatTooLong: 'Message is too long (max 2 000 characters).',
  draftEmpty: 'The message cannot be empty.',
} as const;
