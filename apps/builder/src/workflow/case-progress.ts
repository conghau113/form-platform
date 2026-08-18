import type { NodeProgressStatus } from "@org/workflow-core";

/** How one progress row presents itself: the Vietnamese label and the antd Tag colour. */
export interface ProgressTag {
  label: string;
  /** Omitted ⇒ antd's default (neutral) Tag. */
  color?: string;
}

/**
 * Name a node's progress for the Run view. Pure — the display half of `nodeProgress`, kept out of
 * the contract because it is wording, not semantics.
 *
 * `isTerminal` matters only for rows the case is standing on — one on an ordinary case, one per
 * branch once a fork has run (E3a), and it must be answered about THAT ROW's node rather than about
 * the case: a forked case has several `active` rows, and one shared flag would label them all by
 * whether one arbitrary branch had run out of actions. `nodeProgress` calls those nodes `active`
 * (it reports WHERE the
 * case is, not whether the case is finished), so a case that has run to the end of the graph would
 * otherwise be labelled "Đang xử lý" directly beneath the
 * "Trạng thái kết thúc — không còn hành động" tag on the very same screen. Deciding what "done"
 * means across the several places this repo already answers it differently is E5's job; this is
 * only the label.
 */
export function progressTag(status: NodeProgressStatus, isTerminal: boolean): ProgressTag {
  if (status === "done") return { label: "Xong", color: "green" };
  if (status === "active") {
    return isTerminal ? { label: "Kết thúc" } : { label: "Đang xử lý", color: "processing" };
  }
  return { label: "Chưa tới" };
}
