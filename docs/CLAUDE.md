# Kiss Booster Figma Plugin — Complete Architecture

## Project Overview

**Kiss Booster** is a Figma plugin that accelerates design workflows with tools for section management, dark theme creation, art task automation, text translation, and dev status tracking. The plugin features a horizontal collapsible toolbar with persistent settings (position, theme, button order).

### Key Stats
- **Language:** TypeScript + vanilla JavaScript/HTML
- **Build:** TSC (TypeScript Compiler)
- **Entry Point:** `src/code.ts` (plugin logic) + `ui.html` (UI/iframe)
- **Build Output:** `dist/src/code.js` + `ui.html` (referenced in manifest)
- **Plugin API:** Figma Plugin API v1.0.0

---

## File Structure

```
figma-kiss-booster/
├── src/
│   └── code.ts              # Main plugin logic (1500+ lines)
├── ui.html                  # Plugin UI iframe (800+ lines)
├── dist/
│   └── src/
│       └── code.js          # Compiled plugin code (generated)
├── manifest.json            # Plugin metadata & entry points
├── package.json             # Dependencies & build scripts
├── tsconfig.json            # TypeScript configuration
├── README.md                # User documentation (English)
└── CLAUDE.md                # This file
```

---

## Core Architecture

### Two-Process Model

The plugin runs in two separate contexts:

1. **Plugin Context** (`src/code.ts` → `dist/src/code.js`)
   - Runs in Figma's sandbox
   - Access to Figma API (document, selection, libraries)
   - Handles all design operations
   - Cannot access DOM or external APIs
   - Communicates with UI via postMessage

2. **UI Context** (`ui.html`)
   - Runs in iframe inside Figma
   - HTML/CSS/JavaScript for the toolbar
   - Cannot access Figma API
   - Communicates with plugin via postMessage

**Communication Flow:**
```
User clicks button → UI postMessage('cmd-name') → Plugin executes → 
Plugin postMessage('resize'/'status'/etc) → UI responds
```

---

## Plugin Code (`src/code.ts`)

### Top-Level Structure

#### Constants (lines 1-6)
```typescript
const H_GAP = 80;           // Horizontal spacing between frames
const V_GAP = 160;          // Vertical spacing for dark copies
const SECTION_PADDING = 100; // Section auto-layout padding
```

#### Key Functions by Category

### 1. Helper Functions

**`sendStatus(text, status)`**
- Posts status message to UI for flash feedback
- Shows Figma toast notification
- Used for success/error feedback after operations

**`findDarkMode()` → Promise<{collection, modeId} | null>**
- Searches for "Dark" mode in local variable collections
- If not found, scans library variables in selected nodes
- Essential for wrap/fix operations that create dark copies
- Returns null if no dark mode exists (operations still work without it)

**`findVariable(name)` → Promise<Variable | null>**
- Fuzzy searches local variables first (exact match → ends with → partial)
- Falls back to library variable search
- Used to find `default_system_frame` variable for section fills
- Shows warning if not found but doesn't block operations

**`getSelectedFrames()`**
- Filters selection to only Frame nodes
- Used by wrap/align/expand operations

**`getSelectedSections()`**
- Filters selection to only Section nodes
- Used by fix/expand operations

### 2. Frame Layout Operations

**`alignSectionsInGrid(sections, startX, startY)`**
- Arranges sections in rows: 6 per row, then wraps
- 400px horizontal gap, variable vertical gap (height + 400px)
- Called by alignSections() and wrap operations

**`expandSectionGrow(direction, duplicate?)`**
- Expands selected frame/section horizontally (left/right)
- Shift siblings in same row to avoid overlap (Y-bounds aware)
- If `duplicate=true`: creates a copy instead of expanding
- Uses H_GAP = 80px for spacing

**`replaceWithInstance()`**
- Replaces all selected objects with copies of `lastAddedId`
- Keeps each target's position and size
- Tracks lastAddedId via selectionChange listener

**`findSimilar()`**
- Selects all objects matching selected object's name + size
- Useful for batch operations on repeated components

### 3. Wrap & Fix Operations

**`wrapFrames(withDark = true)`**
- Takes selected frames, wraps into section
- Aligns frames horizontally (80px spacing)
- Optionally creates dark copies (160px below)
- Applies `default_system_frame` variable as section fill
- Returns section id for later selection

**`fixSection(withDark = true)`**
- Takes selected section
- Removes all old dark copies (suffix " — Dark")
- Realigns light frames inside
- Optionally creates fresh dark copies with correct mode
- Resizes section to content

**Dark Theme Creation Flow:**
1. Find dark mode via `findDarkMode()`
2. Clone each frame
3. Rename clone: `frameName — Dark`
4. Move down by V_GAP (160px)
5. Apply dark mode via `setVariableModeAsync()`

### 4. Frame Decoration & Utilities

**`applyFrameBorder(frame, borderSize)`**
- Wraps object in frame with `borderSize` (typically 1px)
- Useful for export prep

**`createArtArrow(artTask, target)`**
- Draws green arrow from ArtTask block to target
- Arrow: horizontal → vertical with 16px corner radius
- Color: #30CB44, stroke: 4px

**`createArtTask(source, targetSize)`**
- Fills ArtTask with source's size (original) and ×3 (production)
- Calls `createArtArrow()` to draw pointer

### 5. Translation

**`runTranslate()`**
- Posts message to UI: `'run-translation'` with target language code
- UI calls Google Translate API for text arrays
- Plugin receives `'apply-data'` message with translations
- Applies translations to all text layers in selection

### 6. Selection & Status Tracking

**Selection Change Listener** (lines ~1200+)
```typescript
figma.on('selectionchange', () => {
  const info = {
    count: selection.length,
    hasSection: selection.some(n => n.type === 'SECTION'),
    hasFrames: selection.some(n => n.type === 'FRAME'),
    allDark: selection.every(n => n.name.includes(' — Dark')),
    hasAny: selection.length > 0,
    textCount: countTextLayers(selection)
  };
  ui.postMessage({ type: 'selection-info', ...info });
});
```
- Sent on every selection change
- Used by UI to enable/disable buttons

**`lastAddedId` Tracking**
- Global variable that stores the last created frame/section
- Updated via selectionChange listener
- Used by Replace operation

### 7. Window Positioning

**`repositionUI(pos)`**
- Calculates window position based on Figma viewport + zoom
- Positions: 'tl' (top-left), 'tr', 'bl', 'br', 'center'
- Margin calculation: `m = 16 / zoom` (scales with zoom)
- Bottom positions: `y = viewport.bottom - windowHeight - m * 3.5` (prevents clipping)
- Clamped to viewport bounds

**Startup Positioning** (lines ~1300)
```typescript
(async () => {
  const pos = await figma.clientStorage.getAsync('uiPos');
  if (pos) repositionUI(pos);
})();
```

### 8. Message Handlers

**UI → Plugin Messages** (window.onmessage):

| Message | Payload | Action |
|---------|---------|--------|
| `'wrap-selection'` | - | Call wrapFrames(true) |
| `'wrap-selection-light'` | - | Call wrapFrames(false) |
| `'fix-selection'` | - | Call fixSection(true) |
| `'fix-selection-light'` | - | Call fixSection(false) |
| `'align-sections'` | - | Call alignSections() |
| `'expand-section'` | - | Call expandSectionGrow('right') |
| `'expand-section-left'` | - | Call expandSectionGrow('left') |
| `'frame-540'` | - | Wrap in 540px frame |
| `'find-similar'` | - | Call findSimilar() |
| `'replace-instance'` | - | Call replaceWithInstance() |
| `'frame-border'` | - | Wrap in 1px border |
| `'create-art-block'` | - | Call createArtTask() |
| `'toggle-dev-status'` | - | Toggle "Ready for Dev" |
| `'move-to-zero'` | - | Move to (0,0) |
| `'set-pos'` | {pos: string} | repositionUI(pos) + save |
| `'save-theme'` | {light: bool} | Save to clientStorage |
| `'get-theme'` | - | Load from clientStorage |
| `'save-order'` | {order: string[]} | Save button order |
| `'get-order'` | - | Load button order |
| `'reset-all'` | - | Clear all clientStorage |
| `'resize'` | {width?, height?} | figma.ui.resize() |
| `'notify'` | {text, error?} | figma.notify() |

---

## UI Code (`ui.html`)

### Structure

#### Top: Styles (lines 1-181)

**CSS Variables for Theming**
```css
:root {
  --bg:#2c2c2c; --btn:#383838; --btn-hover:#444;
  --txt:#fff; --icon:rgba(255,255,255,.85);
  --label:rgba(255,255,255,.5);
}
body.light {
  --bg:#ffffff; --btn:#ebebeb; --btn-hover:#dedede;
  --txt:#1e1e1e; --icon:rgba(0,0,0,.8);
  --label:rgba(0,0,0,.55);
}
```

**Key Classes**
- `.tool-btn` — 64×50px button (flex layout: icon + label)
- `.tool-btn.extra` — Hidden when collapsed (display:none)
- `.tool-btn.primary` — Blue highlight for Wrap button
- `.tool-group` — Stacked pair (expand left/right, 23×50px)
- `.arrow-btn` — Show more chevron (right side, rotates 180° when open)

**Panels (display:none by default)**
- `.settings` — Settings/position/theme/reorder/FAQ/reset
- `.faq` — Help panel with features list
- `.lang` — Language selector (translation mode)

### JavaScript Functions

#### Icon Definition (lines 189-213)
```typescript
const IC = {
  frame, grid, contrast, chevronL, chevronR, align, width, copy, swap,
  scissors, search, image, translate, code, target, gear, sun, moon, help, check, sliders
}
```
- SVG icons defined as constant strings
- Used in button HTML and panels
- Support currentColor inheritance for theming

#### Tool Definitions (lines 228-244)
```typescript
const TOOLS = [
  { id:'wrap', wrapfix:true, icon, label, rule, primary:true },
  { id:'align', icon, label, cmd, rule },
  // ... 11 total tools (Wrap, Align, 540px, Expand, Find, Replace, 1px, Art, Translate, Dev, Zero)
  { id:'settings', settingsBtn:true },
]
```

#### Enable Rules (lines 216-225)
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
- Determines button enable/disable based on selection

### Core Functions

**`post(type, extra)`** — Message to plugin
```typescript
function post(type, extra) {
  parent.postMessage({ pluginMessage: Object.assign({ type }, extra || {}) }, '*');
}
```

**`fitSize()`** — Auto-size window to toolbar
```typescript
function fitSize() {
  const bar = document.getElementById('bar');
  const r = bar.getBoundingClientRect();
  post('resize', { width: Math.ceil(r.width) + 1, height: Math.ceil(r.height) });
}
```

**`buildToolbar()`** — Render all buttons
- Loop through TOOLS array
- Create buttons based on tool type
- Apply enable/disable rules
- Add draggable listeners for reorder mode
- Append arrow button for collapse/expand

**`openSettings()`** — Show settings panel
- Position picker (5 zones: TL, TR, BL, BR, Center)
- Theme toggle (sun/moon icons)
- Reorder button (drag mode)
- FAQ link
- Reset dialog opener
- Fixed width: 560px
- Back button closes and rebuilds toolbar

**`openFaq()`** — Show help panel
- 11 feature items with icons (left column)
- Click item → show description (right column)
- Back arrow closes panel
- Fixed dimensions: 560×420px

**`openResetDialog()`** — Confirmation dialog
- Centered text: "Reset all settings?"
- Yes/No buttons
- Yes clears all clientStorage values

**`renderLangs()`** — Show language selector
- Replaces toolbar with language flag buttons
- 9 languages: Russian, English, German, Polish, Arabic, Chinese, French, Japanese, Korean
- Click language → `runTranslate()`
- Fixed width: 560px

**`toggleTheme()`** — Light/dark mode
- Toggles `body.light` class
- Rebuilds toolbar (sun ↔ moon icon)
- Saves to clientStorage
- Calls fitSize()

**`toggleEdit(gearBtn)`** — Reorder mode
- Toggles `body.edit` class
- Shows wiggle animation on draggable buttons
- Changes gear button to checkmark
- Drag listeners activate
- Save button (checkmark) exits edit mode

**`applySavedOrder(order)`** — Reorder TOOLS array
```typescript
// If saved order: [id1, id2, id3...]
// Move those to front, append unsaved tools to end
```

### Drag & Reorder

**`makeDraggable(el)`**
- Adds pointerdown listener
- Only active in edit mode
- Captures pointer, adds `.dragging` class
- Tracks startX for delta calculation

**Document Listeners:**
- `pointermove` — Updates drag position, shows drop line
- `pointerup` — Inserts element before target, rebuilds toolbar, saves order

**`reorderables()`** — Filter reorderable buttons
- Excludes: arrow-btn, settings-btn (in normal mode), FAQ, position buttons

### State & Persistence

**Local Variables:**
- `selInfo` — Current selection state (count, hasFrames, hasSection, etc.)
- `lightTheme` — Boolean (default: false)
- `editMode` — Boolean (default: false)
- `wfTheme` — Wrap/Fix checkbox state (dark theme copies, default: true)
- `uiPos` — Position: 'tl'|'tr'|'bl'|'br'|'center' (default: 'center')
- `drag` — Active drag state (element, startX)
- `lastBtn` — Last clicked button (for flash feedback)
- `targetLang` — Translation target language code

**ClientStorage Keys** (persisted across sessions):
- `'theme'` — boolean (light mode)
- `'uiPos'` — string (position)
- `'order'` — string[] (button order)

**Message Handlers from Plugin** (window.onmessage):
- `'selection-info'` → Update selInfo, applyEnable()
- `'status'` → flash(status) + button highlight
- `'start-api-call'` → translateViaGoogle()
- `'order'` → applySavedOrder(), buildToolbar()
- `'theme'` → toggleTheme() updates
- `'pos'` → Update uiPos

### Translation

**`translateViaGoogle(payload, target)`**
- Calls Google Translate API via CORS endpoint: `https://translate.googleapis.com/translate_a/single?...`
- Takes array of {id, text} items
- Posts back to plugin: `{ type: 'apply-data', results: [{id, translatedText}, ...] }`

---

## Manifest (`manifest.json`)

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

- `main` — Plugin entry point (compiled TypeScript)
- `ui` — Iframe entry point (HTML)
- `networkAccess` — Google Translate endpoint for translation feature

---

## Build & Deployment

### Build Process

```bash
npm install              # Install dependencies
npm run build            # Run TypeScript compiler (tsc)
npm run watch            # Recompile on file changes
```

**What happens:**
1. TypeScript compiler reads `src/code.ts`
2. Outputs to `dist/src/code.js` (ES2019 compatible)
3. `ui.html` is referenced as-is in manifest
4. No bundling — raw JS output

### Installation

1. Clone repo
2. Figma → Plugins → Development → Import plugin from manifest
3. Select `manifest.json`
4. Plugin appears in plugins menu

---

## Key Design Patterns

### 1. Flex-based Toolbar
- `#bar` uses `display:flex; gap:4px; width:max-content`
- Buttons are 64×50px (or smaller for pairs)
- Arrow button triggers `body.open` class toggle
- Extra buttons hidden via `body:not(.open) .tool-btn.extra { display:none }`

### 2. Panels & Modes
- Only one active: toolbar (default) OR settings OR FAQ OR languages
- Toggled via body classes: `body.settings`, `body.faq`, `body.lang`
- Back buttons rebuild toolbar and reset classes

### 3. Selection-Driven UI
- Every selection change posts `selection-info` to UI
- UI enables/disables buttons based on RULES + selInfo
- Button clicks are disabled if `button.disabled` is true

### 4. Message-Passing Protocol
- Simple string type + optional payload object
- No request/response system (one-way messages)
- Status feedback via flash colors (blue success, red error)

### 5. Theme System
- CSS custom properties (variables) in :root
- `body.light` class overrides all colors
- No hardcoded colors in JS (except icons stroke=#fff)
- Theme persisted in clientStorage

### 6. Window Positioning
- Calculates position on startup from clientStorage
- Adjusts for zoom: `margin = 16px / zoom`
- Bottom margin extra (×3.5) to prevent screen clipping
- Fixed width: 560px for all panels (Settings, Languages, FAQ)

---

## Common Tasks for Agents

### Adding a New Tool

1. Define tool in TOOLS array (ui.html):
   ```typescript
   { id: 'mytool', icon: IC.mytool, label: 'My Tool', cmd: 'my-tool-cmd', rule: 'any' }
   ```

2. Add icon to IC object (ui.html):
   ```typescript
   mytool: S('<path d="M..."/>'),
   ```

3. Add message handler in plugin (src/code.ts):
   ```typescript
   if (msg.type === 'my-tool-cmd') {
     // Implementation
     sendStatus('Done!', 'success');
   }
   ```

4. Add enable rule if needed (ui.html RULES):
   ```typescript
   mytool: s => s.hasFrames && s.count > 1,
   ```

### Changing UI Layout

- Edit `.tool-btn` / `.tool-group` / panel CSS classes
- Adjust dimensions in CSS (width, height, padding, gap)
- Update icon size via SVG viewBox or .btn-icon styling
- Test with buildToolbar() rendering

### Fixing Button Order Issues

- Check applySavedOrder() logic in ui.html
- Ensure order array matches TOOLS ids
- Rebuild toolbar after order change
- Check clientStorage key name: 'order'

### Debugging Selection Issues

- selInfo updates via selection-info message
- Check console for selInfo object (counts, flags)
- RULES determine enable/disable
- Modify RULES if button should be enabled differently

---

## Performance Notes

- No external dependencies (vanilla JS/HTML)
- Lightweight: ~100KB compiled plugin code
- Lazy-load dark mode search (searches on demand, not startup)
- Variable search cached per file (deep clone to avoid mutations)
- Selection listener fires on every change (fast filtering)
- Window resize is synchronous (not debounced)

---

## Known Limitations

1. **Dark mode requires "Dark" mode name** — Case-insensitive search
2. **Default system frame variable** — Must exist in local or library variables
3. **Translation 50-item limit** — Each translation call limited to 50 text nodes (loop for more)
4. **Art task requires component** — Searches current page only, not entire file
5. **Export uses file's current theme** — Dark copies are separate frames (manual export both)

---

## Testing Checklist for New Features

- [ ] Selection-info listener fires on every change
- [ ] Button enable/disable matches RULES
- [ ] fitSize() called after toolbar rebuild
- [ ] Messages post correctly (check network tab)
- [ ] clientStorage persists across close/reopen
- [ ] Theme toggle updates colors immediately
- [ ] Drag reorder saves order to storage
- [ ] Window positioning respects zoom + viewport
- [ ] FAQ/Settings/Languages panels close properly with back button
