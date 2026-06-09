import { type AccessContext, canView, isVisible } from "@org/form-core";
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

export function FormRenderer({ schema, access = { roles: [] } }: NativeFormRendererProps) {
  const form: FormSchema = useMemo(() => migrate(schema), [schema]);
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
