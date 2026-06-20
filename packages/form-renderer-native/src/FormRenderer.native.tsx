import { type AccessContext, canView, isVisible, localizeForm } from "@org/form-core";
// On a real RN project these come from react-native + a native UI kit such as
// @ant-design/react-native or react-native-paper. Stubbed here so the package
// builds in a web-only workspace without native toolchain.
// import { View, Text } from "react-native";
import { type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import type React from "react";
import { useMemo, useState } from "react";

export interface NativeFormRendererProps {
  schema: unknown;
  access?: AccessContext;
  onSubmit?: (values: Record<string, unknown>) => void;
  /** Render the form in this locale (i18n — Phase P). The native renderer shares form-core's
   *  `localizeForm` resolver with the web renderer, so per-node `i18n` override maps collapse to
   *  plain strings before the leaf components map them. Absent ⇒ the authored default strings. */
  locale?: string;
  /** Locale used when `locale` has no translation for a given string (before falling back to the
   *  authored default). Only meaningful alongside `locale`. */
  fallbackLocale?: string;
}

/**
 * Mobile is a SINGLE-COLUMN stacked flow. colSpan from the schema is
 * intentionally ignored — only `hideOnMobile` and `mobileOrder` from layout
 * are honored. Note this renderer reuses the SAME migrate / isVisible / RBAC
 * from form-core; only the leaf components differ from the web renderer.
 */
function orderForMobile(fields: FieldNode[]): FieldNode[] {
  return [...fields]
    .filter((f) => !(f as any).layout?.hideOnMobile)
    .sort((a, b) => ((a as any).layout?.mobileOrder ?? 0) - ((b as any).layout?.mobileOrder ?? 0));
}

export function FormRenderer({
  schema,
  access = { roles: [] },
  locale,
  fallbackLocale,
}: NativeFormRendererProps) {
  // Mirrors the web renderer's pipeline: migrate first, then (i18n) localize. No `locale` ⇒
  // the migrated form is rendered verbatim.
  const form: FormSchema = useMemo(() => {
    const migrated = migrate(schema);
    return locale ? localizeForm(migrated, locale, fallbackLocale) : migrated;
  }, [schema, locale, fallbackLocale]);
  const [values] = useState<Record<string, unknown>>({});

  const renderNode = (node: FieldNode): React.ReactNode => {
    if (!isVisible(node, values)) return null;
    if (!canView(node, access)) return null;

    if (node.type === "group") {
      // return (<View>{node.label ? <Text>{node.label}</Text> : null}
      //   {orderForMobile(node.children).map(renderNode)}</View>);
      return null;
    }

    // Map node.type -> native control here:
    //   text   -> <InputItem />        number -> <InputItem type="number" />
    //   select -> <Picker />           date   -> <DatePicker />
    //   checkbox -> <Switch />
    return null;
  };

  return <>{orderForMobile(form.fields).map(renderNode)}</>;
}
