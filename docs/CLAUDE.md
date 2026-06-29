# Kiss Booster — Architecture & Logic (agent guide)

Authoritative reference for the **Kiss Booster** Figma plugin. Read this before changing
`src/code.ts` or `ui.html`. Reflects the current state of the code.

---

## 1. Build & workflow

- **Two source files only:**
  - `src/code.ts` — plugin sandbox (the "main thread"). Compiled by `tsc`.
  - `ui.html` — the UI iframe. **Not compiled** — `manifest.json` references it directly.
- **Build:** `npm run build` (= `tsc`, target ES2017, strict) → `dist/src/code.js`.
  - After editing **code.ts** → run `npm run build`.
  - After editing **ui.html** → **no build**; verify the script block with
    `node --check` (extract `/<script>([\s\S]*?)<\/script>/`). It is plain browser JS.
- **manifest.json:** `main: dist/src/code.js`, `ui: ui.html`, `networkAccess` allows
  `translate.googleapis.com` (used by the translator).
- **Verifying:** the user (Stepan) checks in Figma himself. **Do NOT use browser-preview
  tools** unless asked. For UI logic you can simulate `ui.html`'s script in Node with a
  mock `document`/`parent` (see how prior sessions tested `composeTools`/pet logic).
- **Commits:** never add an AI co-author — author is Stepan only.

---

## 2. Two-context architecture (critical)

| | `src/code.ts` (sandbox) | `ui.html` (iframe) |
|---|---|---|
| Has | `figma` API, clientStorage | DOM, `fetch`, `eval` |
| Lacks | DOM, `eval`, `Function`, `fetch` to most hosts | the `figma` API |
| Role | mutate the document, persist state | render toolbar/panels, user input |

They communicate **only** via messages:
- UI → plugin: `parent.postMessage({ pluginMessage: { type, ... } }, '*')` (UI helper `post(type, extra)`).
- plugin → UI: `figma.ui.postMessage({ type, ... })`, received in `window.onmessage`.

**Consequence:** you cannot run arbitrary user JS in the plugin (no `eval`). The "Code"
custom button therefore uses a **JSON recipe** interpreted by a whitelist (see §6).

---

## 3. Message protocol

**UI → plugin** (handled in `figma.ui.onmessage` switch in code.ts):
- Tools: `wrap-selection` / `wrap-selection-light`, `fix-selection` / `fix-selection-light`,
  `align-sections`, `frame-540`, `expand-section` / `expand-section-left`, `find-similar`,
  `replace-instance`, `frame-border`, `create-art-block`, `toggle-dev-status`, `move-to-zero`,
  `dark-theme-copy`, `calc-size`, `smart-copy`.
- Ported (colleague): `grid-layout`, `make-component`, `custom-absolute`, `slice-267`.
- Custom buttons: `custom-fn` `{fn, script}` (only `fn:"__script"` is used now → runs the recipe).
- Translation: `run-translation` `{target}` → plugin replies `start-api-call`; UI fetches Google
  Translate, sends back `apply-data` `{results}`.
- State get/save: `get-order`/`save-order`, `get-theme`/`save-theme`, `get-custom`/`save-custom`,
  `get-removed`/`save-removed`, `get-wf`/`save-wf`, `set-pos`, `reset-all`.
- Window: `resize` `{width,height}` (robust: missing dim keeps previous, clamps ≥1), `notify`, `request-selection`.

**plugin → UI** (`window.onmessage`): `status` (button flash), `selection-info`
(`{count,hasSection,hasFrames,allDark,hasAny,textCount}` → drives enable rules),
`order`, `theme`, `custom`, `removed`, `wf`, `pos`, `start-api-call`.

---

## 4. `ui.html` — toolbar & UI logic

### Tool model
- `TOOLS` (const) = built-in tool defs: `wrap`(primary, with dark-theme checkbox), `align`,
  `540`, `expand`(group of two chevron minis), `find`, `replace`, `1px`, `x267`(2.67×),
  `art`, `translate`(`__translate`→language picker), `dev`, `zero`, `component`, `custom`,
  `greed`(label **"Grid"**, cmd `grid-layout`), and `settings`(`settingsBtn`).
- `composeTools()` returns the render list: **Clawd pet (id `claude`) first** →
  built-ins + custom tools (ordered by `savedOrder`) → `settings` last.
- State (module-level lets, persisted in clientStorage):
  - `customTools` — `[{id, name, icon, fn:'__script', script}]` (user "Code" buttons).
  - `removedIds` — hidden built-in ids; **seeded with `DEFAULT_HIDDEN = ['component','custom','greed']`**
    so Comp/Custom/Grid are hidden by default and live in the Functions add-list. Reset re-seeds it.
  - `savedOrder` — persisted tool order (settings & pet excluded).
- `buildToolbar()` iterates `composeTools()`, skips `removedIds`, renders each tool;
  `applyEnable()` toggles `disabled` per `RULES[dataset.rule]` against `selInfo`.

### Collapse / expand
- `body.open` toggled by the ▸ arrow. Collapsed shows the first 3 reorderable tools (`shown<3`)
  + arrow; expanded shows all. Width is dynamic via `fitSize()`.

### Reorder (edit) mode
- `toggleEdit()` → `body.edit`; tools wiggle, become drag-handles (`makeDraggable` + pointer
  events + `#drop-line`). Each shows a **✕ delete badge** (`addDeleteX`→`deleteTool`):
  deleting a built-in adds it to `removedIds`; deleting a custom removes it from `customTools`.
  The gear becomes a ✓ to save+exit. Pet is excluded from reorder (not draggable).

### Panels (replace `#bar`; each "back" returns to **Settings**)
- **Settings** (`openSettings`): position picker (5 zones) + `Functions` · `Theme` · `Reorder` ·
  `FAQ` · `Reset` + Back(✕). Width hugs content.
- **Functions** (`openCreate`, title "Functions"): top = **"Add back removed"** chips (re-add hidden
  built-ins) ; **"Code (JSON)"** button → reveals **Name + Script(JSON)** fields. Select a chip OR
  fill Code, then **"Add function"** (footer). Code buttons get `icon:'code'`, `fn:'__script'`.
  `sizePanel()` fits the window to content (consistent 16px padding).
- **FAQ** (`openFaq`): header + scrollable list (scrollbars hidden) + description.
- **Reset dialog** (`openResetDialog`): compact prompt + Yes/No.
- **Translate** (`renderLangs`): replaces toolbar with 9 language flags + Cancel.

### Window sizing
- `fitSize()` measures `#bar` and posts `resize {width, height}` (skips if bar hidden).
- Panels post their own size (FAQ 560×420 fixed; Settings/Reset/Functions hug content).
- code.ts `resize` handler keeps the previous dimension when one is omitted (never `undefined`).

### Persistence keys (clientStorage)
`uiPos`, `lightTheme`, `toolOrder`, `customTools`, `removedTools`, `wfTheme`, `artTaskKey`.
**Reset** (`reset-all`) deletes the first six and posts defaults back to the UI
(`removed` → re-seeds DEFAULT_HIDDEN; `wf` → true).

### Clawd pet (the crab) 🦀
- First toolbar block; not draggable; deletable via ✕ (→ appears in Functions add-list as "Clawd").
- 14 animation **`<template>`s** in `ui.html` (authentic Clawd SVGs, CSS keyframes inside;
  viewBox normalized to `-8 -11 31 30`). Shown one at a time via `clawdShow(tplId)`.
- Registries + triggers:
  - `CLAWD_IDLE` (idle-living/sleeping/wake) — random rotation every ~9–14s (`petIdleLoop`).
  - `CLAWD_REACT` (working-typing/building/builder/wizard) — random on **any tool click** (`petReact`, hooked in `onTool`/`onWrapFix`).
  - `CLAWD_PET` (eureka/notification/dizzy) — random on **tapping the crab** (`petPlay`).
  - `CLAWD_EXPAND` = crab-walking (marches right, ×2 fast, ~1s) on **expand**; `CLAWD_COLLAPSE` = going-away on **collapse** (`petGesture`).
  - `CLAWD_SETTINGS` = working-overheated, shown on **return from Settings** (panel hides the crab while open).
- **Licensing:** animations adapted from `github.com/marciogranzotto/clawd-tank` (MIT). See
  `THIRD_PARTY_NOTICES.md`. "Clawd" is Anthropic's mascot — MIT doesn't grant brand rights;
  not affiliated with Anthropic. Keep the credit comment in `ui.html` `<head>`.

---

## 5. `src/code.ts` — features (each operates on the current selection)

- `wrapToNewSelection(withDark)` — Wrap: align selected frames into a Section (+ dark copies if a
  Dark variable mode exists); `fixSelection(withDark)` — re-align an existing Section.
- `darkThemeCopy()` — dark-mode clones; `findDarkMode()` finds a "Dark" variable mode.
- `alignSections()` — lay sections in a row. `frame540()` — wrap in 540px auto-layout.
- `expandSectionGrow(dir)` — duplicate a frame / grow a section (row-aware).
- `replaceWithInstance()` — replace selection with a copy of the reference (last-added). `lastAddedId`
  tracked in `trackLastAdded` on `selectionchange`.
- `findSimilar()` — select same-name/size nodes. `frameWithBorder()` — 1px slicing frame.
- `createArtBlock()` / `calculateSize()` — ArtTask sizing (×3) + green arrow; `findArtTaskComponent`.
- `toggleDevStatus()` — Ready-for-Dev. move-to-zero — `(0,0)`.
- **Ported from colleague** (`github.com/vadimdesign-hub/kiss-figma-plugin`, MIT-style):
  `gridLayout()`, `makeComponents()`, `customIgnoreAutoLayout()`, `scaleSelection267()` (slice ×2.67).
- Translator: `run-translation` collects TEXT nodes → UI fetches Google Translate → `apply-data`
  loads fonts and writes translations.
- `sendStatus(text,status)` — notify + flash the clicked toolbar button.

---

## 6. Custom "Code" buttons — JSON recipe (no eval)

A Code button stores `script = { ops: [...] }`. `runScript()` runs each op on every selected node
via `applyScriptOp()` (whitelist — **safe, no eval**). Ops:
`move{dx,dy}` · `pos{x,y}` · `resize{w,h}` · `opacity{value}` · `rotate{deg}` · `corner{value}` ·
`fill{color,opacity}` · `stroke{color,weight}` · `visible{value}` · `lock{value}` ·
`rename{name}` (tokens `{w} {h} {i} {name}`) · `text{value}`.
To add an op: extend `applyScriptOp` (and the `SCRIPT_HINT` string in ui.html).

---

## 7. Figma mockups (file `qIj6SJodJkTXNoKwZn4USF`, Page 2 = node `64:1264`)

Component-based, built via the Figma `use_figma` MCP tool. See memory `project_figma_mockups`.
- Section **"KB Components"**: `icon/*` (26 outline icon components) + `btn/*` (button components,
  each containing an icon instance) + `btn/clawd`/`btn/expand`/`btn/arrow`.
- Board **"Kiss Booster — UI"** (dark) + **"Kiss Booster — UI · Light"**: 9 state tiles each,
  assembled from `btn/*` instances. Variable collection **"Kiss Booster Tokens"** (Dark/Light modes).
- **Gotchas:** wrap `use_figma` code in try/catch + `let out=null` (strict mode rejects undeclared
  assignment); `createNodeFromSvg` returns a FRAME with a default fill → clear the wrapper's fill,
  keep only strokes for outline icons; pass full `<path d="...">`, never raw path data; nodes that
  visually overlap a SECTION get auto-adopted into it; `clone()` can land on the wrong page — set
  `figma.currentPage`/`appendChild` to the intended page.

---

## 8. Conventions

- Match surrounding code style (compact, vanilla). ui.html uses CSS variables + `body.light` for theme.
- Icon set is the `IC` map in ui.html (`S(d)` builds an 18×18 outline SVG). New icon → add to `IC`.
- Keep this doc and `THIRD_PARTY_NOTICES.md` current when adding features/assets.
- **This file + the root `CLAUDE.md` are the source of truth** for the plugin.
