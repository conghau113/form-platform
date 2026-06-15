import type { CSSProperties, ReactNode } from "react";
import { resolveIcon } from "./registry.js";

/** Renders the icon for a token, or `null` when the token is unknown/empty. Use inside JSX
 *  when you want a component; use {@link resolveIconNode} when you need a `ReactNode` to feed
 *  an antd slot prop (e.g. `Input`'s `prefix`). */
export function Icon(props: { token?: string | null; className?: string; style?: CSSProperties }) {
  const { token, ...rest } = props;
  const Resolved = resolveIcon(token);
  return Resolved ? <Resolved {...rest} /> : null;
}

/** Resolve a token to a renderable node (or `undefined` if unknown). Convenience for antd
 *  slot props that take a `ReactNode` and fall back to a text value when absent. */
export function resolveIconNode(
  token: string | undefined | null,
  props?: { className?: string; style?: CSSProperties },
): ReactNode | undefined {
  const Resolved = resolveIcon(token);
  return Resolved ? <Resolved {...props} /> : undefined;
}
