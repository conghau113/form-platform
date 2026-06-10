import { CURRENT_FORM_VERSION, type FormSchema, formSchema } from "./schema.js";

type Migration = (doc: any) => any;

function walk(fields: any[], fn: (f: any) => void): void {
  for (const f of fields ?? []) {
    fn(f);
    if (f && Array.isArray(f.children)) walk(f.children, fn);
    if (f && Array.isArray(f.itemFields)) walk(f.itemFields, fn);
  }
}

/**
 * Migration chain. Each entry upgrades a document from version N to N+1.
 * A renderer can therefore load ANY older JSON and bring it to the current
 * shape before rendering. This is what lets old saved forms keep working
 * after the schema evolves — the package version and the data version are
 * deliberately decoupled.
 */
const migrations: Record<number, Migration> = {
  // v1 -> v2: legacy `colSpanDesktop` number became `layout.colSpan.lg`
  1: (doc) => {
    walk(doc.fields, (f) => {
      if (f.colSpanDesktop != null) {
        f.layout = {
          ...(f.layout ?? {}),
          colSpan: { ...(f.layout?.colSpan ?? {}), lg: f.colSpanDesktop },
        };
        delete f.colSpanDesktop;
      }
    });
    doc.formVersion = 2;
    return doc;
  },
  // v2 -> v3: boolean `show: false` became a conditional `visibleWhen` rule
  2: (doc) => {
    walk(doc.fields, (f) => {
      if (f.show === false) f.visibleWhen = { rule: { "==": [1, 0] } };
      delete f.show;
    });
    doc.formVersion = 3;
    return doc;
  },
};

/** Migrate raw JSON of any supported version up to the current shape, then validate. */
export function migrate(input: unknown): FormSchema {
  let doc: any = structuredClone(input);
  if (typeof doc?.formVersion !== "number") {
    throw new Error("Invalid form document: missing numeric `formVersion`.");
  }
  if (doc.formVersion > CURRENT_FORM_VERSION) {
    throw new Error(
      `Form schema v${doc.formVersion} is newer than this renderer supports ` +
        `(v${CURRENT_FORM_VERSION}). Upgrade @org/form-renderer-* to read it.`,
    );
  }
  while (doc.formVersion < CURRENT_FORM_VERSION) {
    const step = migrations[doc.formVersion];
    if (!step) throw new Error(`No migration registered from v${doc.formVersion}.`);
    doc = step(doc);
  }
  return formSchema.parse(doc);
}
