type Issue = { path: readonly PropertyKey[]; message: string };

/** zod issues → `{ "field.path": "message" }` (first message per field), matching the spec's inline errors. */
export const fieldErrors = ({ issues }: { issues: readonly Issue[] }): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
};
