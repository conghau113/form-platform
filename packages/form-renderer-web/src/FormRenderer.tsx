import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AccessContext,
  buildZodSchema,
  canEdit,
  canView,
  collectAsyncFields,
  collectValueEffects,
  collectWarnings,
  computeNodeReactions,
  computeReactions,
  dataSourceDeps,
  effectiveVisible,
  isVisible,
  type PresetResolver,
  resolveLinkedFields,
} from "@org/form-core";
import { type FieldNode, type FormSchema, isLayoutContainer, migrate } from "@org/form-schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Button,
  Card,
  Col,
  Collapse,
  ConfigProvider,
  Form,
  Row,
  Space,
  Tabs,
  type ThemeConfig,
} from "antd";
import type React from "react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Control, Controller, type Resolver, useForm } from "react-hook-form";
import { ArrayFieldSection } from "./containers/ArrayFieldSection.js";
import { StepsSection } from "./containers/StepsSection.js";
import { FieldControl } from "./controls/FieldControl.js";
import {
  type ColSpanProps,
  isOptionSourced,
  READONLY_INPUT_TYPES,
  type RenderNodeOpts,
  type Scope,
  type Values,
} from "./internal/control-types.js";
import { collectStepNames, containsType, schemaDefaults } from "./internal/defaults.js";
import { FetcherContext } from "./internal/FetcherContext.js";
import { type AsyncCache, getAtPath, runAsyncCheck, setErrorAtPath } from "./internal/resolver.js";
import { FieldPreview } from "./preview/FieldPreview.js";

const DEFAULT_SPAN = { xs: 24, sm: 24, md: 12, lg: 12 };

/** Identity of a rendered node, handed to a `nodeWrapper`. `path` is the positional
 *  route to the node — indices into `fields`, then each container's `children` — and is
 *  stable across `migrate()` (which clones but never reorders), so the designer can map
 *  it back to a tree uid. (Array `itemFields` are NOT walked: array rows aren't authored
 *  on the canvas, so their per-row renders are left unwrapped.) */
export interface NodeWrapperContext {
  node: FieldNode;
  path: number[];
}

export interface FormRendererProps {
  /** Raw JSON of any saved version. Migrated to the current shape internally. */
  schema: unknown;
  /** antd token theme produced by the Theme Editor. */
  theme?: ThemeConfig;
  access?: AccessContext;
  /** Seed values, e.g. when editing an existing submission. Drives conditional visibility. */
  initialValues?: Record<string, unknown>;
  /** Receives a clean, typed values object — only visible/permitted fields. */
  onSubmit?: (values: Record<string, unknown>) => void;
  submitLabel?: string;
  /** Designer hook (additive): wrap every authorable node's rendered output, e.g. in a
   *  selection shell carrying `data-designer-node-id`. Absent in normal runtime use, so
   *  runtime output is unchanged. */
  nodeWrapper?: (rendered: React.ReactNode, ctx: NodeWrapperContext) => React.ReactNode;
  /** Design canvas mode: makes leaf controls pointer-inert (so clicks select the node
   *  instead of editing the input — visuals stay true to runtime, unlike `disabled`) and
   *  hides the Submit button. */
  designMode?: boolean;
  /** Hide the built-in Submit button without entering design mode. Used by the imperative
   *  `openFormDialog`/`openFormDrawer` wrappers, which drive submission from the popup's own
   *  OK button via the `FormRendererHandle.submit()` imperative handle. */
  hideSubmit?: boolean;
  /** Form-wide review mode: render every leaf as plain read text (PreviewText) and hide the
   *  Submit button. Per-field `readPretty`/`readOnly` flags in the schema still apply when this
   *  is false. */
  readPretty?: boolean;
  /** Resolve **linked fields** (Track W4): a field carrying a `presetId` is re-synced against
   *  the preset returned here (preset `patch` base, instance `overrides` on top). Presets live
   *  outside the contract, so the host injects this — typically from its workspace preset store.
   *  Absent ⇒ linked fields render from their own props (a frozen snapshot), so runtime output
   *  is unchanged and the renderer stays usable with no preset source at all. */
  presetResolver?: PresetResolver;
  /** Injectable `fetch` for the renderer's remote calls — dataSource option lists and
   *  `asyncValidator` value checks. Lets an authenticated host add `Authorization` headers or
   *  point at a proxy base, e.g. `(u, o) => fetch(u, { ...o, headers: { Authorization } })`.
   *  Absent ⇒ the global `fetch` is used, so runtime is unchanged. */
  fetcher?: typeof fetch;
}

/** Imperative handle exposed via `ref`. `submit()` programmatically triggers validation +
 *  `onSubmit` exactly as clicking the built-in button would — the popup wrappers call it
 *  from their footer OK button (the popup stays open if validation fails). */
export interface FormRendererHandle {
  submit: () => void;
}

export const FormRenderer = forwardRef<FormRendererHandle, FormRendererProps>(function FormRenderer(
  {
    schema,
    theme,
    access = { roles: [] },
    initialValues,
    onSubmit,
    submitLabel = "Submit",
    nodeWrapper,
    designMode = false,
    hideSubmit = false,
    readPretty = false,
    presetResolver,
    fetcher,
  },
  ref,
) {
  const form: FormSchema = useMemo(() => {
    const migrated = migrate(schema);
    return presetResolver ? resolveLinkedFields(migrated, presetResolver).form : migrated;
  }, [schema, presetResolver]);

  // Self-contained QueryClient so consumers don't have to provide one. Retries
  // are off so dataSource error states surface immediately. Created once.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  // Per-path async-check memo: last value + its (possibly in-flight) check. Entries
  // are registered synchronously in the resolver, so a newer keystroke supersedes an
  // older debounce sleep (see runAsyncCheck). Lives for the component's lifetime.
  const asyncCache = useRef<AsyncCache>(new Map());

  // Validation rebuilds per call so visibility (and RBAC) reflect current values:
  // hidden fields are excluded from validation and stripped from the output. The
  // resolver is ASYNC: after the Zod pass it runs each visible asyncValidator
  // (debounced + memoized per value) and merges `valid:false` results in as field
  // errors — handleSubmit awaits the resolver, so an invalid remote check blocks
  // submit. Fields with a Zod error skip the remote call (one error per field).
  const resolver: Resolver<Values> = async (values, context, options) => {
    const res = await (zodResolver(buildZodSchema(form, { values, access })) as Resolver<Values>)(
      values,
      context,
      options,
    );
    const targets = collectAsyncFields(form, values, access);
    if (targets.length === 0) return res;
    const errors = { ...(res.errors as Record<string, unknown>) };
    let added = false;
    await Promise.all(
      targets.map(async ({ path, name, validator }) => {
        const value = getAtPath(values, path);
        if (value == null || value === "") {
          // Cleared value: drop the memo so re-entering the same value re-checks.
          asyncCache.current.delete(path);
          return;
        }
        if (getAtPath(errors, path)) return;
        let entry = asyncCache.current.get(path);
        if (!entry || !Object.is(entry.value, value)) {
          entry = {
            value,
            promise: runAsyncCheck(asyncCache.current, path, name, value, validator, fetcher),
          };
          asyncCache.current.set(path, entry);
        }
        const result = await entry.promise;
        if (!result.valid) {
          setErrorAtPath(errors, path, {
            type: "asyncValidator",
            message: result.message ?? "Invalid value",
          });
          added = true;
        }
      }),
    );
    if (!added) return res;
    return { values: {}, errors } as Awaited<ReturnType<Resolver<Values>>>;
  };

  const defaultValues = useMemo<Values>(
    () => ({ ...schemaDefaults(form.fields), ...initialValues }),
    [form, initialValues],
  );

  // `settings.validateTrigger` maps onto react-hook-form's validation mode. Absent ⇒
  // RHF's defaults (validate on submit, re-validate on change) — old JSON behaves
  // exactly as before.
  const trigger = form.settings?.validateTrigger;
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger: triggerFields,
    formState,
  } = useForm<Values>({
    defaultValues,
    resolver,
    mode: trigger === "onInput" ? "onChange" : trigger === "onBlur" ? "onBlur" : "onSubmit",
    reValidateMode: trigger === "onBlur" ? "onBlur" : "onChange",
  });
  const values = watch();

  // Reaction effect map for the TOP-LEVEL scope, recomputed from current values.
  // Per-row array scopes compute their own maps in G4; here `effects` only applies
  // where `namePrefix === ""`.
  const effects = computeReactions(form, values);

  // Non-blocking warning messages, recomputed from watched values (same cost class
  // as reactions). Keys are dotted react-hook-form paths, so array rows look up by
  // their full fieldName. Warnings show immediately — not gated on touched state —
  // by design: a violated warning is visible before the first submit attempt.
  const warnings = collectWarnings(form, values, access);

  // Reaction `value` effects: while a `when` holds, push its assigned value once.
  // Keyed on the serialized assignments so the effect only runs when they change;
  // the per-field JSON diff makes re-assignment idempotent (loop-safe together with
  // the engine's value-cycle guard). Paths are bare names at the top level and dotted
  // `array.{i}.{field}` inside array rows — `setValue` handles both.
  const valueAssignments = collectValueEffects(form, values);
  const assignmentsKey = JSON.stringify(valueAssignments);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized assignments
  useEffect(() => {
    for (const [name, val] of Object.entries(valueAssignments)) {
      if (JSON.stringify(getValues(name)) !== JSON.stringify(val)) {
        setValue(name, val, { shouldDirty: false });
      }
    }
  }, [assignmentsKey]);

  const submit = handleSubmit((data) => {
    // Parse once more to strip hidden/non-viewable keys -> a clean typed payload.
    const clean = buildZodSchema(form, { values: data, access }).parse(data);
    onSubmit?.(clean);
  });

  // Let a popup wrapper trigger submission from its own OK button. `submit` already
  // runs validation and only invokes `onSubmit` on success, so the popup stays open
  // when validation fails.
  useImperativeHandle(ref, () => ({ submit: () => void submit() }), [submit]);

  // `namePrefix` lets fields nested in an array bind to `name.{index}.{child}` while
  // top-level fields keep their bare name. `opts` lets a table cell render the control
  // label-less (the column header carries the label) and un-wrapped (full-width cell);
  // `span` lets a grid assign the cell width (the field's own colSpan still wins);
  // `path` is the positional designer route (absent for array rows, which aren't authored).
  const renderNode = (node: FieldNode, namePrefix = "", opts?: RenderNodeOpts): React.ReactNode => {
    // Inside an array row `opts.scope` carries the merged row values + per-row effects;
    // at the top level we fall back to the form's own values and (only there) `effects`.
    const scope = opts?.scope;
    const scopeValues = scope?.values ?? values;
    const scopeEffects = scope ? scope.effects : namePrefix === "" ? effects : undefined;

    // Reaction `visible` effects override `visibleWhen` at this node's scope.
    if (!effectiveVisible(node, scopeValues, scopeEffects)) return null;
    if (!canView(node, access)) return null; // shared RBAC

    const here = opts?.path;
    // Wrap any node's rendered output in the designer shell (when a `nodeWrapper` and a
    // canonical `path` are present). Used for the node itself and for child panes.
    const wrap = (n: FieldNode, path: number[] | undefined, inner: React.ReactNode) =>
      nodeWrapper && path ? nodeWrapper(inner, { node: n, path }) : inner;
    const wrapNode = (inner: React.ReactNode) => wrap(node, here, inner);

    // Children of any container render through this same closure, so visibility,
    // RBAC and array name-prefixes apply at every depth. `basePath` extends the
    // positional path; index `i` is the child's true slot (null renders keep it).
    const renderChildrenAt = (
      children: FieldNode[],
      basePath: number[] | undefined,
      childOpts?: { span?: ColSpanProps },
    ) =>
      children.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
        <Fragment key={i}>
          {renderNode(c, namePrefix, {
            ...childOpts,
            path: basePath ? [...basePath, i] : undefined,
            scope,
          })}
        </Fragment>
      ));
    const containerSpan = opts?.span ?? { span: 24 };

    if (node.type === "group") {
      return (
        <Col key={node.name} {...containerSpan}>
          {wrapNode(
            <fieldset
              style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}
            >
              {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
              <Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>
            </fieldset>,
          )}
        </Col>
      );
    }

    if (node.type === "array") {
      const name = `${namePrefix}${node.name}`;
      // Each row sees a MERGED scope (outer values + that row's own values, row wins) so
      // its fields' visibleWhen/reactions can reference both. Reactions recompute per row.
      const arrayNode = node;
      const getRowScope = (index: number): Scope => {
        const rows = scopeValues[arrayNode.name];
        const row = (Array.isArray(rows) ? (rows[index] ?? {}) : {}) as Record<string, unknown>;
        const merged = { ...scopeValues, ...row };
        return { values: merged, effects: computeNodeReactions(arrayNode.itemFields, merged) };
      };
      return (
        <Col key={name} {...containerSpan}>
          {wrapNode(
            <ArrayFieldSection
              node={node}
              control={control as Control}
              name={name}
              seedRow={() => schemaDefaults(node.itemFields)}
              renderNode={renderNode}
              getRowScope={getRowScope}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "tabs") {
      // `forceRender` is load-bearing: antd lazy-mounts inactive panes, and an
      // unmounted pane never registers its RHF Controllers — defaults would be
      // dropped and required errors would point at fields the user can't see.
      // Map with the ORIGINAL index first, then filter, so a hidden pane never
      // shifts the positional paths of its siblings/children.
      // Carry each pane's ORIGINAL index so a hidden pane never shifts a sibling's
      // designer path; antd's tab `key` still uses the filtered position (`pos`), so the
      // runtime DOM is unchanged.
      const panes = node.children
        .map((pane, i) => ({ pane, i }))
        .filter(({ pane }) => isVisible(pane, scopeValues) && canView(pane, access));
      return (
        <Col key={`${namePrefix}tabs`} {...containerSpan}>
          {wrapNode(
            <Tabs
              items={panes.map(({ pane, i }, pos) => {
                const panePath = here ? [...here, i] : undefined;
                return {
                  key: String(pos),
                  label: pane.label,
                  forceRender: true,
                  children: wrap(
                    pane,
                    panePath,
                    <Row gutter={16}>{renderChildrenAt(pane.children, panePath)}</Row>,
                  ),
                };
              })}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "collapse") {
      // Original index drives the designer path; antd's panel `key` stays the filtered
      // position (`pos`), so `defaultActiveKey` and the DOM match the old runtime exactly.
      const panels = node.children
        .map((panel, i) => ({ panel, i }))
        .filter(({ panel }) => isVisible(panel, scopeValues) && canView(panel, access));
      const keys = panels.map((_, pos) => String(pos));
      return (
        <Col key={`${namePrefix}collapse`} {...containerSpan}>
          {wrapNode(
            <Collapse
              accordion={node.accordion}
              // All panels start open (first only under accordion) so required
              // fields are visible; forceRender keeps closed panels registered.
              defaultActiveKey={node.accordion ? keys.slice(0, 1) : keys}
              items={panels.map(({ panel, i }, pos) => {
                const panelPath = here ? [...here, i] : undefined;
                return {
                  key: String(pos),
                  label: panel.label,
                  forceRender: true,
                  children: wrap(
                    panel,
                    panelPath,
                    <Row gutter={16}>{renderChildrenAt(panel.children, panelPath)}</Row>,
                  ),
                };
              })}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "card") {
      return (
        <Col key={`${namePrefix}card`} {...containerSpan}>
          {wrapNode(
            <Card title={node.title}>
              <Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>
            </Card>,
          )}
        </Col>
      );
    }

    if (node.type === "grid") {
      const cell = Math.max(1, Math.floor(24 / (node.cols ?? 2)));
      return (
        <Col key={`${namePrefix}grid`} {...containerSpan}>
          {wrapNode(
            <Row gutter={16}>
              {renderChildrenAt(node.children, here, {
                span: { xs: 24, sm: 24, md: cell, lg: cell },
              })}
            </Row>,
          )}
        </Col>
      );
    }

    if (node.type === "space") {
      return (
        <Col key={`${namePrefix}space`} {...containerSpan}>
          {wrapNode(
            <Space direction={node.direction ?? "horizontal"} wrap>
              {node.children.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
                <Fragment key={i}>
                  {renderNode(c, namePrefix, {
                    bare: true,
                    path: here ? [...here, i] : undefined,
                    scope,
                  })}
                </Fragment>
              ))}
            </Space>,
          )}
        </Col>
      );
    }

    if (node.type === "steps") {
      // Visible panes carry their ORIGINAL index `i` (so a hidden step never shifts a
      // sibling's designer path), filtered exactly like the tabs case.
      const panes = node.children
        .map((pane, i) => ({ pane, i }))
        .filter(({ pane }) => isVisible(pane, scopeValues) && canView(pane, access));
      return (
        <Col key={`${namePrefix}steps`} {...containerSpan}>
          {wrapNode(
            <StepsSection
              panes={panes}
              here={here}
              renderPaneBody={(pane, panePath) =>
                wrap(
                  pane,
                  panePath,
                  <Row gutter={16}>{renderChildrenAt(pane.children, panePath)}</Row>,
                )
              }
              stepNames={(pane) => collectStepNames(pane.children)}
              trigger={triggerFields}
              errors={formState.errors as Record<string, unknown>}
              submitCount={formState.submitCount}
              designMode={designMode}
              hideSubmit={hideSubmit}
              readPretty={readPretty}
              submitLabel={submitLabel}
            />,
          )}
        </Col>
      );
    }

    if (isLayoutContainer(node)) {
      // Orphaned tab-pane / collapse-panel placed outside their parent (possible
      // in hand-written JSON): render their children as a plain transparent row.
      return (
        <Col key={`${namePrefix}${node.type}`} {...containerSpan}>
          {wrapNode(<Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>)}
        </Col>
      );
    }

    // Responsive: a grid-assigned span (if any) replaces the default; the field's
    // own per-breakpoint colSpan always wins. antd collapses to xs on small screens.
    const span = { ...(opts?.span ?? DEFAULT_SPAN), ...(node.layout?.colSpan ?? {}) };
    // Reaction effects for this leaf, at its own scope (a row's EffectMap inside an
    // array, the top-level map otherwise). A `disabled` effect can re-enable a statically
    // disabled field; an `options` effect overrides select/radio.
    const eff = scopeEffects?.[node.name];
    const editable = canEdit(node, access) && !(eff?.disabled ?? node.disabled === true);
    // Interaction pattern (precedence readPretty > readOnly > disabled). A form-wide
    // `readPretty` review mode forces every leaf to the read view.
    const readPrettyMode = readPretty || node.readPretty === true;
    const readOnlyMode = !readPrettyMode && node.readOnly === true;
    // readPretty always previews; readOnly previews too for controls antd can't render
    // read-only (everything except the text/number inputs).
    const usePreview = readPrettyMode || (readOnlyMode && !READONLY_INPUT_TYPES.has(node.type));
    // The asterisk reflects a reaction `required` effect when present, else the static flag.
    const requiredMark = eff?.required ?? node.required;
    // A select with a dependent dataSource reads each dependency field's current value
    // (the `dependsOn` parent + every `params[].from`), keyed by field name.
    // NOTE: deps resolve against the row scope's merged values; a top-level dep referenced
    // from inside a row reads the merged value (out of G4 scope to change — see plan risk #4).
    // Every option-sourced control (select/checkbox-group/cascader/tree-select) can
    // read options from a dependent dataSource.
    const optionDs = isOptionSourced(node) ? node.dataSource : undefined;
    const depValues = optionDs
      ? Object.fromEntries(dataSourceDeps(optionDs).map((field) => [field, scopeValues[field]]))
      : undefined;
    const fieldName = `${namePrefix}${node.name}`;
    // Non-blocking warning at this field's dotted path. An error always wins the
    // status + help slot; a warning shows antd's yellow state but never blocks.
    const warning = warnings[fieldName];
    const control_ = (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Form.Item
            label={opts?.hideLabel ? undefined : node.label}
            htmlFor={opts?.hideLabel ? undefined : fieldName}
            tooltip={opts?.hideLabel ? undefined : node.tooltip}
            required={opts?.hideLabel ? undefined : requiredMark}
            style={opts?.bare ? { marginBottom: 0 } : undefined}
            validateStatus={fieldState.error ? "error" : warning ? "warning" : undefined}
            help={
              fieldState.error?.message ?? warning ?? (opts?.hideLabel ? undefined : node.helpText)
            }
            extra={opts?.hideLabel ? undefined : node.extra}
            hasFeedback={node.hasFeedback}
            {...node.decoratorProps}
          >
            {/* readPretty / readOnly-without-antd-support → a plain read view (PreviewText).
                In design mode the control stays fully visible but pointer-inert (a click
                selects the node instead of typing into the input). Runtime renders the
                control directly so its DOM is byte-for-byte unchanged. */}
            {usePreview ? (
              <FieldPreview node={node} value={field.value} optionsOverride={eff?.options} />
            ) : designMode ? (
              <div style={{ pointerEvents: "none" }}>
                <FieldControl
                  node={node}
                  value={field.value}
                  disabled={!editable && !readOnlyMode}
                  readOnly={readOnlyMode}
                  onChange={field.onChange}
                  depValues={depValues}
                  optionsOverride={eff?.options}
                  id={fieldName}
                  submitUrl={form.settings?.submitUrl}
                />
              </div>
            ) : trigger === "onBlur" ? (
              // RHF's onBlur mode needs `field.onBlur` to fire; the controls don't
              // thread it, so a boxless (display:contents) wrapper catches the
              // bubbling focusout. Only rendered under the onBlur trigger — every
              // other form keeps its runtime DOM byte-for-byte unchanged.
              // biome-ignore lint/a11y/noStaticElementInteractions: invisible display:contents wrapper only threads RHF's onBlur, no semantic role
              <div style={{ display: "contents" }} onBlur={field.onBlur}>
                <FieldControl
                  node={node}
                  value={field.value}
                  disabled={!editable && !readOnlyMode}
                  readOnly={readOnlyMode}
                  onChange={field.onChange}
                  depValues={depValues}
                  optionsOverride={eff?.options}
                  id={fieldName}
                  submitUrl={form.settings?.submitUrl}
                />
              </div>
            ) : (
              <FieldControl
                node={node}
                value={field.value}
                disabled={!editable && !readOnlyMode}
                readOnly={readOnlyMode}
                onChange={field.onChange}
                depValues={depValues}
                optionsOverride={eff?.options}
                id={fieldName}
                submitUrl={form.settings?.submitUrl}
              />
            )}
          </Form.Item>
        )}
      />
    );
    // A table cell renders the control bare (full width); otherwise wrap in a responsive Col.
    if (opts?.bare) return wrapNode(control_);
    return (
      <Col key={fieldName} {...span}>
        {wrapNode(control_)}
      </Col>
    );
  };

  const lp = form.layoutProps;
  // A `steps` wizard owns its own Submit (on the last step), so hide the global one.
  const hasSteps = useMemo(() => containsType(form.fields, "steps"), [form]);
  return (
    <QueryClientProvider client={queryClient}>
      <FetcherContext.Provider value={fetcher}>
        <ConfigProvider theme={theme}>
          <Form
            component={false}
            layout={lp?.layout ?? "vertical"}
            labelCol={lp?.labelCol}
            wrapperCol={lp?.wrapperCol}
            size={lp?.size}
            colon={lp?.colon}
            labelAlign={lp?.labelAlign}
            labelWrap={lp?.labelWrap}
          >
            <form onSubmit={submit} noValidate>
              <Row gutter={16}>
                {form.fields.map((n, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: schema fields are static per render
                  <Fragment key={i}>{renderNode(n, "", { path: [i] })}</Fragment>
                ))}
              </Row>
              {/* The Submit button is meaningless on the design canvas, in form-wide review
                (readPretty) mode, and when a popup wrapper drives submission (hideSubmit). */}
              {!designMode && !hideSubmit && !readPretty && !hasSteps && (
                <Button type="primary" htmlType="submit">
                  {submitLabel}
                </Button>
              )}
            </form>
          </Form>
        </ConfigProvider>
      </FetcherContext.Provider>
    </QueryClientProvider>
  );
});
