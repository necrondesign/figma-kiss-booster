# Kiss Booster Figma Plugin — Technical Specification

## Executive Summary

Build a Figma plugin with a horizontal collapsible toolbar (250×62px collapsed, expands to show 11 tools). Plugin must include dark theme support, window positioning (5 zones), button reordering, FAQ panel, and persistent settings via clientStorage.

---

## Project Requirements

### Technology Stack
- **Language:** TypeScript (src/code.ts) + vanilla JavaScript/HTML (ui.html)
- **Build:** TypeScript Compiler (tsc) → dist/src/code.js
- **Figma API:** v1.0.0
- **External API:** Google Translate (CORS: translate.googleapis.com)
- **Build Command:** `npm run build` (generates dist/src/code.js; ui.html copied as-is)

### File Structure
```
project/
├── src/code.ts              # Plugin logic (TypeScript, ~1450 lines)
├── ui.html                  # Toolbar UI (HTML/CSS/JS, ~750 lines)
├── dist/src/code.js         # Compiled output (auto-generated)
├── manifest.json            # Plugin metadata
├── package.json             # Dependencies: typescript, @figma/plugin-typings
├── tsconfig.json            # TypeScript config (target: ES2019)
└── README.md                # User documentation (English)
```

---

## Plugin Architecture

### Two-Context Model

**Plugin Context** (src/code.ts → dist/src/code.js)
- Runs in Figma sandbox
- Access: Figma API, document, selection, libraries, variables
- Cannot: access DOM, external APIs (except via UI message relay)
- Communicates: postMessage to UI with { pluginMessage: { type, ...payload } }

**UI Context** (ui.html iframe)
- Runs in Figma iframe
- Access: DOM, CSS, JavaScript, external APIs
- Cannot: access Figma API directly
- Communicates: postMessage to parent with { pluginMessage: { type, ...payload } }

**Flow:** User clicks button → UI posts message → Plugin executes → Plugin posts response → UI updates

---

## Constants (src/code.ts)

```typescript
const H_GAP = 80;               // Horizontal spacing between frames
const V_GAP = 160;              // Vertical spacing for dark copies
const SECTION_PADDING = 100;    // Section auto-layout padding
const SECTION_GAP = 400;        // Spacing between aligned sections
const FRAME_FIXED_WIDTH = 540;  // Fixed width for 540px frame
```

---

## Plugin Functions (src/code.ts)

### Helper Functions

**sendStatus(text: string, status: "success" | "error" | "")**
- Posts to UI: `{ type: "status", text, status }`
- Shows Figma toast: `figma.notify(text, status === "error" ? { error: true } : undefined)`

**findDarkMode(): Promise<{collection, modeId} | null>**
- Search order:
  1. Local variable collections (case-insensitive "Dark" mode name)
  2. Library variables (scan first 50 nodes in selection for bound variables)
- Return: `{ collection, modeId }` or null if not found

**findVariable(name): Promise<Variable | null>**
- Search order (local variables first):
  1. Exact match: `v.name === name`
  2. Ends with: `v.name.endsWith("/" + name)`
  3. Partial: `v.name.toLowerCase().includes(name.toLowerCase())`
- Then search library variables if not found locally
- Show warning if not found: figma.notify(`⚠ "${name}" not found`)

**getSelectedFrames(): Frame[]**
- Filter figma.currentPage.selection to Frame nodes only

**getSelectedSections(): Section[]**
- Filter figma.currentPage.selection to Section nodes only

### Layout Operations

**alignSectionsInGrid(sections: Section[], startX: number, startY: number): void**
- Arrange sections in rows: 6 per row
- Horizontal gap: SECTION_GAP (400px)
- Vertical gap: section.height + SECTION_GAP
- Set section.x and section.y

**expandSectionGrow(direction: "left" | "right", duplicate?: boolean): void**
- If duplicate=true: clone selected frame, place left/right with H_GAP spacing
- If duplicate=false: expand section width by (frame.width + H_GAP)
- Shift siblings in same row (check Y bounds: sibling.y >= section.y - 10 && sibling.y <= section.y + section.height + 10)
- Only shift if gap < SECTION_GAP; then cascade shift right-most sections

**replaceWithInstance(): void**
- Replace all selected objects with copies of lastAddedId
- Keep each target's position and size
- Update lastAddedId on selectionChange listener

**findSimilar(): void**
- Select all objects on page matching: name === selected.name && width === selected.width && height === selected.height

### Wrap & Fix Operations

**wrapFrames(withDark: boolean): Promise<string>**
- Take selected frames, align horizontally (H_GAP = 80px)
- Create Section around them
- If withDark=true:
  - Find dark mode via findDarkMode()
  - Clone each frame, rename: `${frame.name} — Dark`, move down by V_GAP
  - Apply dark mode via setVariableModeAsync()
- Find variable "default_system_frame", apply as section fill
- Resize section to content
- Return section.id

**fixSection(withDark: boolean): Promise<void>**
- Take selected section
- Delete all children with name ending " — Dark"
- Re-align remaining frames horizontally (H_GAP = 80px)
- If withDark=true: create fresh dark copies (same as wrapFrames)
- Resize section to content

### Frame Utilities

**applyFrameBorder(frame: SceneNode, borderSize: number): void**
- Wrap frame in new Frame with strokeWidth=borderSize, no fill, no stroke color

**createArtArrow(artTask: SceneNode, target: SceneNode): void**
- Draw green arrow (#30CB44, stroke 4px) from artTask to target
- Path: horizontal → vertical with 16px corner radius
- Don't overlap artTask or target bounds

**createArtTask(source: SceneNode, targetSize: {width, height}): void**
- Fill selected ArtTask component with text: `${source.width}×${source.height}px` and `${targetSize.width}×${targetSize.height}px`
- Call createArtArrow(artTask, source)

### Translation

**runTranslate(target: string): void**
- Post to UI: `{ type: "run-translation", target }`
- UI calls Google Translate API
- Plugin receives: `{ type: "apply-data", results: [{id, translatedText}, ...] }`
- Apply translations to text layers in selection

### Selection Tracking

**On figma.on('selectionchange')**
- Build selection info:
  ```typescript
  {
    type: "selection-info",
    count: selection.length,
    hasSection: selection.some(n => n.type === 'SECTION'),
    hasFrames: selection.some(n => n.type === 'FRAME'),
    allDark: selection.every(n => n.name.includes(' — Dark')),
    hasAny: selection.length > 0,
    textCount: countTextLayers(selection)
  }
  ```
- Post to UI
- Update `lastAddedId` if selection changed

### Window Positioning

**repositionUI(pos: "tl" | "tr" | "bl" | "br" | "center"): void**
- Get viewport: `figma.viewport.bounds`
- Get zoom: `figma.viewport.zoom`
- Calculate margin: `m = 16 / zoom`
- Position mapping (window height = 62px collapsed, 420px FAQ):
  - `tl`: x = m, y = m
  - `tr`: x = viewport.right - windowWidth - m, y = m
  - `bl`: x = m, y = viewport.bottom - windowHeight - m * 3.5
  - `br`: x = viewport.right - windowWidth - m, y = viewport.bottom - windowHeight - m * 3.5
  - `center`: x = (viewport.left + viewport.right) / 2 - windowWidth / 2, y = (viewport.top + viewport.bottom) / 2 - windowHeight / 2
- Clamp to viewport bounds
- Call `figma.ui.moveTo(x, y)`

### Message Handlers

**window.onmessage = (e) => { const msg = e.data.pluginMessage; ... }**

| Message | Payload | Action |
|---------|---------|--------|
| wrap-selection | - | await wrapFrames(true) |
| wrap-selection-light | - | await wrapFrames(false) |
| fix-selection | - | await fixSection(true) |
| fix-selection-light | - | await fixSection(false) |
| align-sections | - | await alignSectionsInGrid(...) |
| expand-section | - | await expandSectionGrow('right') |
| expand-section-left | - | await expandSectionGrow('left') |
| frame-540 | - | Create 540px frame wrapper |
| find-similar | - | await findSimilar() |
| replace-instance | - | await replaceWithInstance() |
| frame-border | - | await applyFrameBorder(..., 1) |
| create-art-block | - | await createArtTask(...) |
| toggle-dev-status | - | Toggle "Ready for Dev" badges |
| move-to-zero | - | selection[0].x = 0; selection[0].y = 0 |
| set-pos | {pos: string} | await repositionUI(pos); save to clientStorage |
| save-theme | {light: bool} | figma.clientStorage.setAsync('theme', light) |
| get-theme | - | Load from clientStorage['theme'] |
| save-order | {order: string[]} | figma.clientStorage.setAsync('order', order) |
| get-order | - | Load from clientStorage['order'] |
| reset-all | - | Clear all clientStorage keys |
| resize | {width?, height?} | figma.ui.resize(width, height) |
| notify | {text, error?} | figma.notify(text, error ? {error:true} : undefined) |

---

## UI Code (ui.html)

### CSS System

**Color Variables** (CSS custom properties, swap on body.light)
```css
:root {
  --bg:#2c2c2c; --btn:#383838; --btn-hover:#444;
  --txt:#fff; --icon:rgba(255,255,255,.85); --label:rgba(255,255,255,.5);
  --muted:rgba(255,255,255,.4);
  --chk-border:rgba(255,255,255,.7); --chk-bg:#fff; --chk-check:#2c2c2c;
}
body.light {
  --bg:#ffffff; --btn:#ebebeb; --btn-hover:#dedede;
  --txt:#1e1e1e; --icon:rgba(0,0,0,.8); --label:rgba(0,0,0,.55);
  --muted:rgba(0,0,0,.4);
  --chk-border:rgba(0,0,0,.45); --chk-bg:#0c8ce9; --chk-check:#fff;
}
```

**Button Dimensions**
- `.tool-btn`: 64×50px (flex column: icon top, label bottom)
- `.tool-group .mini`: 23×50px (2 stacked 23×23px buttons)
- `.arrow-btn`: 22×50px

**Visibility Toggle**
- Collapsed (default): `body:not(.open) .tool-btn.extra { display:none }`
- Expanded: `body.open .arrow-btn svg { transform:rotate(180deg) }`

### Icons (18 total)

All SVG, stroke-based, 18×18px viewBox, currentColor inheritance:
```
frame, grid, contrast, chevronL, chevronR, align, width, copy, swap,
scissors, search, image, translate, code, target, gear, sun, moon, help, check, sliders, greed
```

Define as: `const IC = { name: S('<path d="..."/>'), ... }`
Helper: `const S = (d) => <svg>...</svg>`

### Tools Array

```typescript
const TOOLS = [
  { id:'wrap', wrapfix:true, icon, label, rule, primary:true },
  { id:'align', icon, label, cmd, rule },
  { id:'540', icon, label, cmd, rule },
  { id:'expand', group: [{icon, cmd, rule}, {icon, cmd, rule}] },
  { id:'find', icon, label, cmd, rule, extra:true },
  { id:'replace', icon, label, cmd, rule, extra:true },
  { id:'1px', icon, label, cmd, rule, extra:true },
  { id:'art', icon, label, cmd, rule, extra:true },
  { id:'translate', icon, label, cmd, rule, extra:true },
  { id:'dev', icon, label, cmd, rule, extra:true },
  { id:'zero', icon, label, cmd, rule, extra:true },
  { id:'greed', icon, label, cmd, rule, extra:true },
  { id:'settings', settingsBtn:true },
]
```

**Collapsed view (first 3 + arrow):** Wrap, Align, 540px, [arrow]
**Expanded view:** all 12 tools + arrow

### Enable Rules

```typescript
const RULES = {
  wrap: s => s.hasFrames && !s.hasSection && !s.allDark && s.count > 0,
  wrapfix: s => s.hasSection || (s.hasFrames && !s.allDark && s.count > 0),
  section: s => s.hasSection,
  one: s => s.count === 1,
  any: s => s.hasAny,
  two: s => s.count >= 2,
  text: s => (s.textCount || 0) > 0,
  always: s => true,
}
```

### Core Functions

**post(type, extra)**
- parent.postMessage({ pluginMessage: Object.assign({ type }, extra || {}) }, '*')

**fitSize()**
- Measure #bar bounding rect
- post('resize', { width: Math.ceil(r.width) + 1, height: Math.ceil(r.height) })

**buildToolbar()**
- Clear #bar innerHTML
- Loop TOOLS array
- Show first 3 tools always, rest hidden (display:none) unless body.open
- Create buttons from TOOLS, apply enable/disable rules
- Add arrow button at end
- Call fitSize()

**openSettings()**
- Show position picker (5 zones: TL, TR, BL, BR, Center with bracket/plus icons)
- Theme toggle button (sun/moon)
- Reorder button → toggleEdit(null)
- FAQ link → openFaq()
- Reset button → openResetDialog()
- Back button → closeSettings()
- Fixed width: 560px via post('resize', { width: 560 })

**openFaq()**
- 11 feature items with icons
- Left panel (150px): list of features, clickable
- Right panel (flex:1): feature title + description
- Back arrow + "FAQ" text in header (left-aligned)
- Height: 420px via post('resize', { height: 420 })

**openResetDialog()**
- Centered text: "Reset all settings?"
- Yes/No buttons
- Yes: post('reset-all'), closeSettings()

**renderLangs()**
- Replace toolbar with 9 language buttons (flag emoji + name)
- Languages: Russian, English, German, Polish, Arabic, Chinese, French, Japanese, Korean
- Back button closes
- Fixed width: 560px

**toggleTheme()**
- Toggle body.light class
- buildToolbar() (sun ↔ moon icon)
- fitSize()
- post('save-theme', { light: lightTheme })

**toggleEdit(gearBtn)**
- Toggle body.edit class
- Show wiggle animation on buttons
- Show checkmark button instead of settings
- Save button exits edit mode, saves order

### Drag & Reorder

**makeDraggable(el)**
- On pointerdown (edit mode only): capture pointer, add .dragging class
- On pointermove: updateDragPosition, showDropLine(targetBefore(x))
- On pointerup: insertBefore, rebuild, saveOrder(), fitSize()

**reorderables()**
- Filter #bar children: exclude .arrow-btn, .check-btn, .pos-btn, .faq-btn

**applySavedOrder(order: string[])**
- Reorder TOOLS array: move saved IDs to front, append unsaved to end

### State & Persistence

**Local variables:**
- `selInfo` — current selection info (count, hasSection, hasFrames, etc.)
- `lightTheme` — boolean (default: false)
- `editMode` — boolean (default: false)
- `wfTheme` — Wrap/Fix checkbox state (default: true)
- `uiPos` — position string (default: 'center')
- `drag` — active drag state or null
- `targetLang` — translation language code

**ClientStorage keys:**
- `'theme'` → boolean
- `'uiPos'` → string
- `'order'` → string[]

**Message handlers (window.onmessage):**
- selection-info → update selInfo, applyEnable()
- status → flash(status)
- start-api-call → translateViaGoogle()
- order → applySavedOrder(), buildToolbar()
- theme → lightTheme = !!msg.light, body.light toggle, buildToolbar()
- pos → uiPos = msg.pos, buildToolbar()

### Translation

**translateViaGoogle(payload: [{id, text}], target: string)**
- Fetch: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`
- Parse: `data[0].map(p => p[0]).join('')` → translated text
- Post back: `{ type: 'apply-data', results: [{id, translatedText}, ...] }`

---

## UI Dimensions

### Toolbar
- **Collapsed:** 250×62px (first 3 tools + arrow)
- **Expanded:** ~600×62px (all tools + arrow)
- **Button size:** 64×50px (icon top, label bottom)
- **Mini buttons:** 23×50px (pair for expand left/right)
- **Arrow:** 22×50px

### Panels (fixed width 560px, variable height)
- **Settings:** 560×62px (position picker, theme, reorder, FAQ, reset)
- **Languages:** 560×62px (9 language buttons)
- **FAQ:** 560×420px (left panel 150px, right panel flex:1)
- **Reset dialog:** 560×62px (centered text, buttons)

---

## Manifest (manifest.json)

```json
{
  "id": "kiss-booster-plugin",
  "name": "Kiss booster",
  "api": "1.0.0",
  "main": "dist/src/code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://translate.googleapis.com"],
    "reasoning": "Uses Google Translate API for text translation."
  }
}
```

---

## Build & Deployment

```bash
npm install
npm run build    # tsc compiles src/code.ts → dist/src/code.js
npm run watch    # Recompile on changes
```

**Installation:** Figma → Plugins → Development → Import plugin from manifest.json

---

## UI/UX Specifications

### Button States
- Normal: --btn background
- Hover: --btn-hover background
- Active: scale(0.94) transform
- Disabled: opacity 0.35

### Flash Feedback
- Success (blue): background #0c8ce9 for 1.1s
- Error (red): background #e03e1a for 1.1s

### Wrap/Fix Checkbox
- Position: top-right corner of Wrap button
- Size: 13×13px
- Border: 1.5px, var(--chk-border)
- On state: background var(--chk-bg)
- Check icon: 9×9px inside

### FAQ Back Arrow
- Size: 24×24px
- Icon: chevronL (left arrow)
- Style: var(--btn) background, var(--txt) color
- Hover: var(--btn-hover)

### Position Picker
- 5 zones: TL, TR, BL, BR, Center
- Size: 18×18px each
- Corners: bracket icons (└─, ─┘, ┌─, ─┐)
- Center: plus icon (+)
- Hover: color change to var(--txt)
- Selected: color #0c8ce9

---

## Error Handling

- Variable not found: Show warning toast, continue operation
- Dark mode not found: Skip dark copy creation, continue wrapping
- Translation error: Show "Translation error" toast
- Selection error: Disable button via RULES

---

## Performance Targets

- Toolbar render: < 50ms
- Button click response: immediate (sync)
- Wrap operation: < 2s (for 10 frames)
- Drag reorder: 60fps smooth animation
- Theme toggle: < 100ms

---

## Testing Checklist

- [ ] Toolbar renders correctly (collapsed/expanded)
- [ ] Buttons enable/disable per RULES
- [ ] Selection info updates on every change
- [ ] Wrap creates dark copies with correct mode
- [ ] Fix realigns frames and recreates copies
- [ ] Expand cascades sections correctly (row-aware)
- [ ] Position picker saves and restores position
- [ ] Theme toggle changes all colors immediately
- [ ] Button reorder persists across reload
- [ ] FAQ displays all 11 features with descriptions
- [ ] Translation works for selected text layers
- [ ] Reset clears all settings (theme, position, order)
- [ ] Window positioning respects zoom and viewport
- [ ] Hot reload works without losing state

---

## Known Limitations

1. Dark mode requires collection named "Dark" (case-insensitive)
2. default_system_frame variable must exist (local or library)
3. Translation: max 50 items per call (loop for more)
4. Art task: searches current page only
5. Export: dark copies are separate frames (manual export)
