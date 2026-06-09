import { z } from "zod";

/**
 * The CURRENT schema format version.
 * IMPORTANT: this is independent of the npm package version.
 * Bump this ONLY when the JSON data shape changes (rare), and add a
 * migration in migrate.ts. The package version changes on every code release.
 */
export const CURRENT_FORM_VERSION = 3 as const;

export const colSpanSchema = z.object({
  xs: z.number().int().min(1).max(24).optional(),
  sm: z.number().int().min(1).max(24).optional(),
  md: z.number().int().min(1).max(24).optional(),
  lg: z.number().int().min(1).max(24).optional(),
});

/** Layout is described semantically. Web reads colSpan; native ignores it
 *  and honors only hideOnMobile / mobileOrder. */
export const layoutSchema = z.object({
  colSpan: colSpanSchema.optional(),
  hideOnMobile: z.boolean().optional(),
  mobileOrder: z.number().int().optional(),
});

/** Conditional visibility. The `rule` is a JSONLogic expression evaluated by a
 *  SAFE evaluator in form-core. NEVER eval() these rules. */
export const conditionSchema = z.object({
  rule: z.record(z.string(), z.any()),
});

export const permissionSchema = z.object({
  viewRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),
});

const commonFields = {
  name: z.string().min(1),
  label: z.string(),
  helpText: z.string().optional(),
  required: z.boolean().optional(),
  layout: layoutSchema.optional(),
  visibleWhen: conditionSchema.optional(),
  permissions: permissionSchema.optional(),
};

export const textFieldSchema = z.object({
  type: z.literal("text"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
});

export const textareaFieldSchema = z.object({
  type: z.literal("textarea"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
  rows: z.number().int().optional(),
});

export const numberFieldSchema = z.object({
  type: z.literal("number"),
  ...commonFields,
  min: z.number().optional(),
  max: z.number().optional(),
});

export const optionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const selectFieldSchema = z.object({
  type: z.literal("select"),
  ...commonFields,
  multiple: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  dataSource: z
    .object({
      url: z.string(),
      labelKey: z.string(),
      valueKey: z.string(),
      dependsOn: z.string().optional(),
    })
    .optional(),
});

export const dateFieldSchema = z.object({ type: z.literal("date"), ...commonFields });
export const checkboxFieldSchema = z.object({ type: z.literal("checkbox"), ...commonFields });

export type LeafField =
  | z.infer<typeof textFieldSchema>
  | z.infer<typeof textareaFieldSchema>
  | z.infer<typeof numberFieldSchema>
  | z.infer<typeof selectFieldSchema>
  | z.infer<typeof dateFieldSchema>
  | z.infer<typeof checkboxFieldSchema>;

export interface GroupField {
  type: "group";
  name: string;
  label?: string;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export type FieldNode = LeafField | GroupField;

export const groupFieldSchema: z.ZodType<GroupField> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    name: z.string().min(1),
    label: z.string().optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const fieldNodeSchema: z.ZodType<FieldNode> = z.lazy(() =>
  z.union([
    textFieldSchema,
    textareaFieldSchema,
    numberFieldSchema,
    selectFieldSchema,
    dateFieldSchema,
    checkboxFieldSchema,
    groupFieldSchema,
  ]),
);

export const formSchema = z.object({
  formVersion: z.number().int(),
  id: z.string(),
  title: z.string(),
  fields: z.array(fieldNodeSchema),
  settings: z.object({ submitUrl: z.string().optional() }).optional(),
});

export type FormSchema = z.infer<typeof formSchema>;
