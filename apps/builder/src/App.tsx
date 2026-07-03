import { toAntdTheme } from "@org/form-theme";
import { App as AntApp, Button, Space, Typography, Upload } from "antd";
import { useMemo, useState } from "react";
import { AiAssistantDrawer } from "./ai";
import { DesignerProvider, type DesignerValue, useDragon } from "./canvas";
import {
  useEditorShortcuts,
  useFormEditor,
  useFormPersistence,
  useNavigationGuard,
} from "./editor";
import { emptySelection, select, selectMany, toggle } from "./engine/selection";
import { applyStepsOp } from "./engine/steps-ops";
import { applyFieldEdit, fieldToTree } from "./engine/transform";
import {
  clone,
  collectNames,
  findNode,
  insertAfter,
  patchNode,
  remove,
  setColSpan,
} from "./engine/tree";
import { describeNode, metaGuard, newField } from "./field-registry";
import { parseFormFile } from "./lib";
import { PropertyPanel } from "./PropertyPanel";
import { presetResolverFromList, usePresets } from "./presets";
import { TemplateGallery, useUserTemplates } from "./templates";
import { PublishControl } from "./versions";
import { CompositePanel } from "./workbench/CompositePanel";
import { HoverProvider } from "./workbench/hover";
import { oneOf, usePersistentState } from "./workbench/persist";
import { SettingsPanel } from "./workbench/SettingsPanel";
import { type Device, ToolbarPanel, type ViewMode } from "./workbench/ToolbarPanel";
import { ViewPanel } from "./workbench/ViewPanel";
import { ExplorerToggle } from "./workspace/ExplorerToggle";

/** Canvas/preview content width per simulated device. */
const VIEWPORTS = { Desktop: 1280, Tablet: 768, Mobile: 375 } as const;

export interface AppProps {
  /** Form to load on mount (the `/projects/:id/forms/:formId` leaf). */
  formId?: string;
  /** Project context (W3): scopes the preset library to global ∪ this project. Absent ⇒ global only. */
  projectId?: string;
  /** Called after a successful save (lets the workspace rail refresh form titles). */
  onSaved?: () => void;
  /** Reports whether the editor has unsaved changes (drives the navigation guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Hands a stable save function up so the guard can "save then proceed". Returns success. */
  provideSave?: (save: () => Promise<boolean>) => void;
  /** Workspace shell: explorer rail collapsed state (hide toggle lives in this header). */
  explorerCollapsed?: boolean;
  onExplorerCollapsedChange?: (collapsed: boolean) => void;
}

export function App({
  formId,
  projectId,
  onSaved,
  onDirtyChange,
  provideSave,
  explorerCollapsed,
  onExplorerCollapsedChange,
}: AppProps = {}) {
  const { message } = AntApp.useApp();
  // The designer document (history / selection / clipboard) and everything derived from it.
  const editor = useFormEditor();
  const {
    history,
    tree,
    form,
    selection,
    setSelection,
    selectedUid,
    clipboard,
    setClipboard,
    schema,
    json,
    formSelected,
    selected,
    siblingNames,
    fieldNames,
    applyJson,
    applyGeneratedForm,
    loadSchema,
  } = editor;

  // Form + theme persistence (owns design tokens + the clean baselines + save/load).
  const { tokens, setTokens, savedTokens, savedIndex, onSave, onLoad } = useFormPersistence({
    json,
    historyIndex: history.index,
    currentFormId: form.id,
    loadSchema,
    formId,
    onSaved,
  });

  // Global canvas keyboard shortcuts (undo/redo, select-all, copy/paste, move, delete).
  useEditorShortcuts({ history, tree, selection, setSelection, clipboard, setClipboard });

  // Unsaved-changes machinery: dirty signal, stable save, refresh/close prompt.
  useNavigationGuard({
    historyIndex: history.index,
    savedIndex,
    tokens,
    savedTokens,
    onSave,
    onDirtyChange,
    provideSave,
  });

  const [device, setDevice] = usePersistentState<Device>(
    "device",
    "Desktop",
    oneOf("Desktop", "Tablet", "Mobile"),
  );
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    "viewMode",
    "design",
    oneOf("design", "json", "preview"),
  );
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const userTemplates = useUserTemplates();

  // Preview language (i18n P2): the locale the canvas/preview render in. `undefined` ⇒ the
  // authored default. The switcher offers the form's default + extra locales.
  const [previewLocale, setPreviewLocale] = useState<string | undefined>(undefined);
  const localeOptions = useMemo(() => {
    const all = [...(form.defaultLocale ? [form.defaultLocale] : []), ...(form.locales ?? [])];
    return [...new Set(all)];
  }, [form.defaultLocale, form.locales]);
  // Drop a stale selection if the form no longer offers that locale.
  const activeLocale =
    previewLocale && localeOptions.includes(previewLocale) ? previewLocale : undefined;

  // Preset library (Track W3/W4), lifted here so the gallery, the "Linked preset" control and
  // the live preview share ONE store — editing a preset then propagates to its linked fields.
  const presets = usePresets(projectId);
  const allPresets = useMemo(
    () => [...presets.builtin, ...presets.user],
    [presets.builtin, presets.user],
  );
  const presetResolver = useMemo(() => presetResolverFromList(allPresets), [allPresets]);

  // The neutral design tokens are mapped to an antd ThemeConfig that wraps the
  // preview, so editing a token re-themes the rendered form live.
  const antdTheme = useMemo(() => toAntdTheme(tokens), [tokens]);

  // Pointer drag engine: palette "create" drags and on-canvas "move" drags both
  // commit a single tree op and select the result. A press that doesn't drag selects.
  const dragon = useDragon({
    getTree: () => tree,
    guard: metaGuard(),
    createNode: (type, patch, taken) => fieldToTree(newField(type, taken, patch)),
    commit: (next, dropped) => {
      history.set(next, "Drop field");
      setSelection(selectMany(emptySelection, dropped));
    },
    onClickSelect: (uids, additive) =>
      setSelection((s) => (additive ? toggle(s, uids[0]) : select(emptySelection, uids[0]))),
  });

  function onRemove(uid: string) {
    const node = findNode(tree, uid);
    if (!node || node.node.type === "form" || !describeNode(node.node.type).behavior.deletable) {
      return;
    }
    history.set(remove(tree, uid), "Delete");
    if (selectedUid === uid) setSelection(emptySelection);
  }

  // Duplicate a node in place (right after itself), with fresh uids + unique names.
  function onCopy(uid: string) {
    const node = findNode(tree, uid);
    if (!node || node.node.type === "form" || !describeNode(node.node.type).behavior.cloneable) {
      return;
    }
    const dup = clone(node, collectNames(tree));
    const next = insertAfter(tree, uid, dup, metaGuard());
    if (next !== tree) {
      history.set(next, "Duplicate");
      setSelection(select(emptySelection, dup.uid));
    }
  }

  const designer: DesignerValue = {
    selected: selection.selected,
    drag: dragon.drag,
    beginMove: dragon.beginMove,
    beginCreate: dragon.beginCreate,
    copy: onCopy,
    remove: onRemove,
    select: (uid, additive) =>
      setSelection((s) => (additive ? toggle(s, uid) : select(emptySelection, uid))),
    // A press on empty canvas selects the Form root, surfacing its settings.
    clearSelection: () => setSelection(select(emptySelection, tree.uid)),
    // D7 marquee: replace the selection with the rubber-band's hits (empty → root).
    setSelected: (uids) =>
      setSelection(
        uids.length ? selectMany(emptySelection, uids) : select(emptySelection, tree.uid),
      ),
    // Direct-manipulation grid resize: write the active breakpoint's colSpan. Every
    // step of one drag shares a `gesture` tag so it collapses to a single undo step.
    resizeColSpan: (uid, key, span, gesture) =>
      history.set(
        (prev) => setColSpan(prev, uid, key, span),
        "Resize column",
        `resize:${uid}:${gesture}`,
      ),
  };

  function onExportTheme() {
    const blob = new Blob([JSON.stringify(tokens, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id || "theme"}.theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Portable, backend-free download of the current form schema (Phase I).
  function onExportForm() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id || "form"}.form.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load a form from an uploaded .json file (untrusted → migrate validates).
  async function onImportForm(file: File) {
    try {
      loadSchema(parseFormFile(await file.text()));
      message.success(`Imported "${file.name}"`);
    } catch (e) {
      message.error(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <DesignerProvider value={designer}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {onExplorerCollapsedChange && (
            <ExplorerToggle
              collapsed={explorerCollapsed ?? false}
              onCollapsedChange={onExplorerCollapsedChange}
            />
          )}
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: "nowrap" }}>
            Builder
          </Typography.Title>
          <Space wrap style={{ marginLeft: "auto" }}>
            <Button onClick={() => setAiOpen(true)}>✨ Generate with AI</Button>
            <Button onClick={() => setGalleryOpen(true)}>Templates</Button>
            <Button onClick={onExportForm}>Export</Button>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => {
                void onImportForm(file);
                return false; // handle locally; never POST
              }}
            >
              <Button>Import</Button>
            </Upload>
            <Button type="primary" onClick={onSave}>
              Save
            </Button>
            {formId && <PublishControl formId={formId} schema={schema} onSave={onSave} />}
            <Button onClick={() => onLoad()}>Load</Button>
          </Space>
        </header>

        <AiAssistantDrawer
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          currentSchema={schema}
          onApply={applyGeneratedForm}
        />

        <TemplateGallery
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onUse={loadSchema}
          userTemplates={userTemplates.templates}
          onSaveCurrent={(title) => userTemplates.save(title, schema)}
          onDeleteUser={userTemplates.remove}
        />

        <HoverProvider>
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <aside
              style={{
                // Shrinks toward 220px on narrow viewports so the canvas keeps room.
                width: "clamp(220px, 18vw, 260px)",
                flexShrink: 0,
                borderRight: "1px solid rgba(0,0,0,0.08)",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <CompositePanel
                tree={tree}
                history={{
                  entries: history.entries,
                  index: history.index,
                  jumpTo: history.jumpTo,
                }}
                tokens={tokens}
                onChangeTokens={setTokens}
                onExportTheme={onExportTheme}
                selectedField={selected?.field ?? null}
                projectId={projectId}
                presets={presets}
              />
            </aside>

            <section
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
                borderRight: "1px solid rgba(0,0,0,0.08)",
                minHeight: 0,
              }}
            >
              <ToolbarPanel
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                device={device}
                onDevice={setDevice}
                viewMode={viewMode}
                onViewMode={setViewMode}
                locales={localeOptions}
                locale={activeLocale}
                onLocale={setPreviewLocale}
              />
              <ViewPanel
                mode={viewMode}
                schema={schema}
                json={json}
                tree={tree}
                antdTheme={antdTheme}
                maxWidth={VIEWPORTS[device]}
                onApplyJson={applyJson}
                presetResolver={presetResolver}
                locale={activeLocale}
                fallbackLocale={form.defaultLocale}
                onGenerateWithAi={() => setAiOpen(true)}
              />
            </section>

            <SettingsPanel
              tree={tree}
              selectedUid={selectedUid}
              onSelect={(uid) => setSelection(select(emptySelection, uid))}
            >
              <PropertyPanel
                selected={selected}
                form={formSelected ? form : null}
                siblingNames={siblingNames}
                fieldNames={fieldNames}
                presets={allPresets}
                locales={form.locales}
                onChange={(uid, field) =>
                  history.set(applyFieldEdit(tree, uid, field), "Edit field")
                }
                onStepsEdit={(uid, op) =>
                  history.set(applyStepsOp(tree, uid, op, metaGuard()), "Edit steps")
                }
                onChangeForm={(patch) => history.set(patchNode(tree, tree.uid, patch), "Edit form")}
              />
            </SettingsPanel>
          </div>
        </HoverProvider>
      </div>
    </DesignerProvider>
  );
}
