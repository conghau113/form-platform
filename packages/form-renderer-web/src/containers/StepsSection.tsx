import type { StepField } from "@org/form-schema";
import { Button, Space, Steps } from "antd";
import type React from "react";
import { useEffect, useState } from "react";

/** Renders a `steps` wizard: one `step` pane visible at a time with a Prev/Next footer.
 *  Like tabs, EVERY pane stays mounted (inactive ones hidden with `display:none`) so its
 *  react-hook-form Controllers register — defaults and required errors stay correct.
 *  `Next` validates ONLY the current step's fields; `Submit` (which posts the whole form)
 *  shows only on the last step. Header clicks may jump backward at runtime, freely in
 *  design mode. `renderNode` is a closure (no hooks), so this is a real component owning
 *  the current-step state — same reason `array` uses `ArrayFieldSection`. */
export function StepsSection(props: {
  panes: Array<{ pane: StepField; i: number }>;
  here: number[] | undefined;
  renderPaneBody: (pane: StepField, panePath: number[] | undefined) => React.ReactNode;
  stepNames: (pane: StepField) => string[];
  trigger: (names?: string[]) => Promise<boolean>;
  /** react-hook-form's error map (keys are field names) — drives the submit-fail jump. */
  errors: Record<string, unknown>;
  /** Increments on every submit attempt; the signal to jump to the first errored step. */
  submitCount: number;
  designMode: boolean;
  hideSubmit: boolean;
  readPretty: boolean;
  submitLabel: string;
}) {
  const {
    panes,
    here,
    renderPaneBody,
    stepNames,
    trigger,
    errors,
    submitCount,
    designMode,
    hideSubmit,
    readPretty,
    submitLabel,
  } = props;
  const [cur, setCur] = useState(0);
  const count = panes.length;
  const clamped = Math.min(cur, Math.max(0, count - 1));

  // After a submit attempt (valid or not), land on the first step owning an errored field.
  // A clean submit has no errors, so this no-ops. Keyed on submitCount: errors update with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: jump only when a submit is attempted
  useEffect(() => {
    if (submitCount === 0) return;
    const bad = panes.findIndex(({ pane }) => stepNames(pane).some((n) => n in errors));
    if (bad >= 0) setCur(bad);
  }, [submitCount]);

  if (count === 0) return null;
  const isLast = clamped === count - 1;
  const showSubmit = isLast && !designMode && !hideSubmit && !readPretty;

  const next = async () => {
    if (await trigger(stepNames(panes[clamped].pane))) setCur(clamped + 1);
  };

  return (
    <>
      <Steps
        current={clamped}
        // Runtime: header navigates BACKWARD only (forward must clear Next's validation).
        // Design mode: free navigation so the author can inspect any step.
        onChange={(to) => {
          if (designMode || to < clamped) setCur(to);
        }}
        items={panes.map(({ pane }) => ({ title: pane.label, description: pane.description }))}
        style={{ marginBottom: 16 }}
      />
      {panes.map(({ pane, i }, pos) => {
        const panePath = here ? [...here, i] : undefined;
        return (
          <div key={i} style={{ display: pos === clamped ? undefined : "none" }}>
            {renderPaneBody(pane, panePath)}
          </div>
        );
      })}
      {!designMode && (
        <Space style={{ marginTop: 16 }}>
          {clamped > 0 && <Button onClick={() => setCur(clamped - 1)}>Previous</Button>}
          {!isLast && (
            <Button type="primary" onClick={next}>
              Next
            </Button>
          )}
          {showSubmit && (
            <Button type="primary" htmlType="submit">
              {submitLabel}
            </Button>
          )}
        </Space>
      )}
    </>
  );
}
