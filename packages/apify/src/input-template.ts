export type TemplateValues = Record<string, string | number>;

const whole = /^\{\{(\w+)\}\}$/;
const inline = /\{\{(\w+)\}\}/g;

const lookup = (values: TemplateValues, name: string) => {
  if (!Object.hasOwn(values, name)) throw new Error(`Unknown input template placeholder: ${name}`);
  return values[name] as string | number;
};

const fill = (node: unknown, values: TemplateValues): unknown => {
  if (typeof node === 'string') {
    const match = whole.exec(node);
    if (match) return lookup(values, match[1] as string);
    return node.replace(inline, (_, name: string) => String(lookup(values, name)));
  }
  if (Array.isArray(node)) return node.map((item) => fill(item, values));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, values)]));
  }
  return node;
};

/** A string that is exactly `"{{name}}"` becomes the raw value; placeholders in longer strings are interpolated. */
export const fillInputTemplate = (
  template: Record<string, unknown>,
  values: TemplateValues,
): Record<string, unknown> => fill(template, values) as Record<string, unknown>;

/** Names of all placeholders used in a template. */
export const templatePlaceholders = (template: unknown): Set<string> =>
  new Set([...JSON.stringify(template).matchAll(inline)].map((m) => m[1] as string));
