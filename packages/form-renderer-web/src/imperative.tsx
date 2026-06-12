import type { AccessContext } from "@org/form-core";
import { Button, ConfigProvider, Drawer, Modal, Space, type ThemeConfig } from "antd";
import type React from "react";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormRenderer, type FormRendererHandle } from "./FormRenderer.js";

/** Values resolved by a popup form — the same clean, typed payload `FormRenderer.onSubmit`
 *  produces (visible + permitted fields only). */
export type FormPopupValues = Record<string, unknown>;

/** Options shared by the dialog and drawer wrappers. They forward straight to the wrapped
 *  `FormRenderer` (theme/initialValues/access) plus the popup chrome (title/OK/Cancel). */
interface BasePopupOptions {
  title?: string;
  theme?: ThemeConfig;
  initialValues?: Record<string, unknown>;
  access?: AccessContext;
  okText?: string;
  cancelText?: string;
}

export interface FormDialogOptions extends BasePopupOptions {
  width?: number | string;
}

export interface FormDrawerOptions extends BasePopupOptions {
  placement?: "top" | "right" | "bottom" | "left";
  width?: number | string;
  height?: number | string;
}

/** What a popup shell (Modal/Drawer) needs from the host to wire its footer. */
interface ShellArgs {
  open: boolean;
  /** OK button: trigger the form's validation + submit. */
  onOk: () => void;
  /** Cancel / close (mask, X, Esc, Cancel button): resolve `undefined`. */
  onClose: () => void;
  /** Close animation finished — unmount + detach. */
  afterClose: () => void;
  body: React.ReactNode;
}

/** Holds the popup's open state + the imperative handle, and resolves the promise exactly
 *  once. OK drives `ref.submit()`; a successful submit (validation passed) resolves the
 *  values and closes, while a failed submit leaves the popup open with errors showing. */
function PopupHost(props: {
  schema: unknown;
  opts: BasePopupOptions;
  resolve: (v: FormPopupValues | undefined) => void;
  dispose: () => void;
  renderShell: (args: ShellArgs) => React.ReactNode;
}) {
  const { schema, opts, resolve, dispose, renderShell } = props;
  const [open, setOpen] = useState(true);
  const ref = useRef<FormRendererHandle>(null);
  const settled = useRef(false);

  const settle = (v: FormPopupValues | undefined) => {
    if (settled.current) return;
    settled.current = true;
    resolve(v);
    setOpen(false); // animate closed; `afterClose` then unmounts
  };

  const body = (
    <FormRenderer
      ref={ref}
      schema={schema}
      hideSubmit
      theme={opts.theme}
      initialValues={opts.initialValues}
      access={opts.access}
      onSubmit={(values) => settle(values)}
    />
  );

  // ConfigProvider here themes the popup chrome (title/footer); FormRenderer themes its
  // own body internally, so passing `theme` to both keeps them consistent.
  return (
    <ConfigProvider theme={opts.theme}>
      {renderShell({
        open,
        onOk: () => ref.current?.submit(),
        onClose: () => settle(undefined),
        afterClose: dispose,
        body,
      })}
    </ConfigProvider>
  );
}

/** Mount a popup on a detached host, render `renderShell`, and resolve when it closes. */
function mountPopup(
  schema: unknown,
  opts: BasePopupOptions,
  renderShell: (args: ShellArgs) => React.ReactNode,
): Promise<FormPopupValues | undefined> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    // Defer so we never unmount the root from inside antd's close callback (React forbids
    // a synchronous unmount during render/commit).
    const dispose = () => {
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(
      <PopupHost
        schema={schema}
        opts={opts}
        resolve={resolve}
        dispose={dispose}
        renderShell={renderShell}
      />,
    );
  });
}

/** Open a `FormRenderer` in an antd Modal and await its result.
 *  Resolves the submitted values on OK (after validation passes) or `undefined` on cancel. */
export function openFormDialog(
  schema: unknown,
  opts: FormDialogOptions = {},
): Promise<FormPopupValues | undefined> {
  return mountPopup(schema, opts, ({ open, onOk, onClose, afterClose, body }) => (
    <Modal
      open={open}
      title={opts.title}
      okText={opts.okText}
      cancelText={opts.cancelText}
      width={opts.width}
      onOk={onOk}
      onCancel={onClose}
      afterClose={afterClose}
    >
      {body}
    </Modal>
  ));
}

/** Open a `FormRenderer` in an antd Drawer and await its result. Same resolve semantics as
 *  `openFormDialog`; the footer carries the OK/Cancel buttons. */
export function openFormDrawer(
  schema: unknown,
  opts: FormDrawerOptions = {},
): Promise<FormPopupValues | undefined> {
  return mountPopup(schema, opts, ({ open, onOk, onClose, afterClose, body }) => (
    <Drawer
      open={open}
      title={opts.title}
      placement={opts.placement ?? "right"}
      width={opts.width}
      height={opts.height}
      onClose={onClose}
      afterOpenChange={(o) => {
        if (!o) afterClose();
      }}
      footer={
        <Space style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <Button onClick={onClose}>{opts.cancelText ?? "Cancel"}</Button>
          <Button type="primary" onClick={onOk}>
            {opts.okText ?? "OK"}
          </Button>
        </Space>
      }
    >
      {body}
    </Drawer>
  ));
}
