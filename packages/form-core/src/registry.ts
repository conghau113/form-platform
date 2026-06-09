import type { FieldNode } from "@org/form-schema";

/**
 * Each platform renderer supplies its own registry mapping a field `type`
 * to a platform component. The traversal, visibility, and RBAC logic stay
 * shared in form-core — only the leaf components differ per platform.
 */
export interface FieldComponentProps<TValue = unknown> {
  node: FieldNode;
  value: TValue;
  disabled?: boolean;
  onChange: (value: TValue) => void;
}

export type ComponentRegistry<C> = Partial<Record<FieldNode["type"], C>>;
