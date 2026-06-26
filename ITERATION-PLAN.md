# Kiss Booster Plugin — Iterative Build Plan for Small Context (9B Model)

## Overview
Build Kiss Booster Figma plugin from scratch in 20 small iterations. Each iteration:
- Adds 1-2 features only
- Uses < 100 lines of code
- Creates working, testable plugin
- Can be compiled and tested immediately
- NO cleanup needed after - each iteration is final

**Total estimated tokens per iteration:** 1500-2500 (context window safe)

---

## Iteration 1: Project Setup & Manifest
**Context:** 1000 tokens
**Time:** 5 minutes

### Files to create:

**manifest.json** (exactly):
```json
{
  "id": "kiss-booster-plugin",
  "name": "Kiss booster",
  "api": "1.0.0",
  "main": "dist/src/code.js",
  "ui": "ui.html",
  "editorType": ["figma"]
}
```

**package.json** (exactly):
```json
{
  "name": "kiss-booster",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^4.9.0",
    "@figma/plugin-typings": "latest"
  }
}
```

**tsconfig.json** (exactly):
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "commonjs",
    "lib": ["ES2019", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": false,
    "esModuleInterop": true
  },
  "include": ["src/code.ts"]
}
```

### What to do:
1. Create empty directories: `src/`, `dist/`
2. Create 3 files above
3. Run: `npm install`
4. Done ✅

### Test:
- Files exist
- No error messages

---

## Iteration 2: Empty Plugin Skeleton
**Context:** 800 tokens
**Time:** 5 minutes

### File: src/code.ts

```typescript
const H_GAP = 80;
const V_GAP = 160;

figma.showUI(__html__, { width: 250, height: 62 });

figma.ui.onmessage = async (msg: any) => {
  console.log("Message received:", msg.type);
};

figma.on("selectionchange", () => {
  figma.ui.postMessage({ 
    type: "selection-info",
    count: figma.currentPage.selection.length
  });
});
```

### What to do:
1. Create `src/code.ts` with code above
2. Run: `npm run build`
3. Check: No errors, `dist/src/code.js` created

### Test:
- `npm run build` succeeds
- No error messages

---

## Iteration 3: Basic Toolbar UI
**Context:** 900 tokens
**Time:** 5 minutes

### File: ui.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { --bg:#2c2c2c; --btn:#383838; --txt:#fff; }
    body.light { --bg:#fff; --btn:#ebebeb; --txt:#1e1e1e; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:var(--bg); color:var(--txt); font-family:system-ui; }
    #bar { display:flex; gap:4px; padding:6px; width:max-content; }
    .btn { width:60px; height:50px; background:var(--btn); border:none; color:var(--txt); cursor:pointer; border-radius:4px; }
    .btn:hover { opacity:0.8; }
  </style>
</head>
<body>
  <div id="bar">
    <button class="btn" onclick="post('wrap')">Wrap</button>
  </div>

  <script>
    function post(type) {
      parent.postMessage({ pluginMessage: { type } }, '*');
    }

    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      console.log("UI received:", msg);
    };
  </script>
</body>
</html>
```

### What to do:
1. Create `ui.html` with code above
2. Run: `npm run build`
3. Check: No errors

### Test:
- `npm run build` succeeds
- ui.html loads without errors

---

## Iteration 4: Add Message Handler for Wrap
**Context:** 1200 tokens
**Time:** 10 minutes

### Update: src/code.ts

Replace the message handler section:

```typescript
async function wrapFrames() {
  const frames = figma.currentPage.selection.filter((n: any) => n.type === "FRAME");
  
  if (frames.length === 0) {
    figma.notify("No frames selected");
    return;
  }

  // Align frames horizontally
  frames.forEach((frame: any, i: number) => {
    frame.x = i * (frame.width + H_GAP);
  });

  // Create section
  const section = figma.createSection();
  section.x = 0;
  section.y = 0;
  frames.forEach((f: any) => {
    section.appendChild(f);
  });

  figma.notify(`Wrapped ${frames.length} frames`);
}

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "wrap") {
    await wrapFrames();
  }
};
```

### What to do:
1. Replace message handler in `src/code.ts`
2. Run: `npm run build`
3. Check: No errors
4. Test in Figma: select frames, click Wrap button

### Test:
- Compile succeeds
- Plugin loads in Figma
- Wrap button works

---

## Iteration 5: Add Selection Info Display
**Context:** 1000 tokens
**Time:** 5 minutes

### Update: ui.html

Add to JavaScript section:

```javascript
let selInfo = { count: 0 };

function updateUI() {
  const status = document.getElementById("status");
  if (!status) {
    const s = document.createElement("div");
    s.id = "status";
    s.style.padding = "4px 8px";
    s.style.fontSize = "10px";
    s.style.color = "var(--txt)";
    document.body.appendChild(s);
  }
  document.getElementById("status").textContent = `Selected: ${selInfo.count}`;
}

window.onmessage = (e) => {
  const msg = e.data.pluginMessage;
  if (msg.type === "selection-info") {
    selInfo = msg;
    updateUI();
  }
};

updateUI();
```

### What to do:
1. Add code above to ui.html
2. Run: `npm run build`
3. Check: No errors
4. Test: Selection count shows in toolbar

### Test:
- Selection count displays
- Updates when selection changes

---

## Iteration 6: Add Fix Section Function
**Context:** 1200 tokens
**Time:** 10 minutes

### Update: src/code.ts

Add function:

```typescript
async function fixSection() {
  const sections = figma.currentPage.selection.filter((n: any) => n.type === "SECTION");
  
  if (sections.length === 0) {
    figma.notify("No section selected");
    return;
  }

  const section = sections[0] as any;
  
  // Remove dark copies
  const toDel = section.children.filter((c: any) => c.name.includes(" — Dark"));
  toDel.forEach((c: any) => c.remove());

  // Re-align
  const light = section.children.filter((c: any) => !c.name.includes(" — Dark"));
  light.forEach((f: any, i: number) => {
    f.x = i * (f.width + H_GAP);
  });

  figma.notify("Section fixed");
}
```

Add to message handler:

```typescript
if (msg.type === "fix") {
  await fixSection();
}
```

### Update: ui.html

Add button:

```html
<button class="btn" onclick="post('fix')">Fix</button>
```

### What to do:
1. Add function to code.ts
2. Add message handler case
3. Add button to ui.html
4. Run: `npm run build`
5. Test: Select section, click Fix

### Test:
- Plugin compiles
- Fix button appears
- Removes " — Dark" frames

---

## Iteration 7: Add Align Sections Function
**Context:** 1100 tokens
**Time:** 10 minutes

### Add to src/code.ts:

```typescript
function alignSectionsInGrid() {
  const sections = figma.currentPage.selection.filter((n: any) => n.type === "SECTION");
  
  if (sections.length === 0) {
    figma.notify("No sections selected");
    return;
  }

  let x = 0, y = 0, rowHeight = 0;
  sections.forEach((section: any, i: number) => {
    if (i > 0 && i % 6 === 0) {
      x = 0;
      y += rowHeight + 400;
      rowHeight = 0;
    }
    section.x = x;
    section.y = y;
    x += section.width + 400;
    rowHeight = Math.max(rowHeight, section.height);
  });

  figma.notify("Sections aligned");
}
```

Add to message handler:

```typescript
if (msg.type === "align") {
  alignSectionsInGrid();
}
```

### Update ui.html:

```html
<button class="btn" onclick="post('align')">Align</button>
```

### Test:
- Plugin compiles
- Align button works

---

## Iteration 8: Add Dark Mode Support (findDarkMode)
**Context:** 1000 tokens
**Time:** 10 minutes

### Add to src/code.ts:

```typescript
async function findDarkMode(): Promise<any> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const col of collections) {
    const dark = col.modes.find((m: any) => m.name.toLowerCase() === "dark");
    if (dark) return { collection: col, modeId: dark.modeId };
  }
  return null;
}

async function createDarkCopy(frame: any): Promise<void> {
  const copy = frame.clone();
  copy.name = frame.name + " — Dark";
  copy.y = frame.y + frame.height + V_GAP;
  
  const darkMode = await findDarkMode();
  if (darkMode) {
    // Apply dark mode (optional, may need variable binding)
  }
}
```

### Add to wrapFrames:

```typescript
// After creating section, optionally create dark copies:
if (true) { // can be toggleable later
  for (const f of frames) {
    await createDarkCopy(f);
  }
}
```

### Test:
- Plugin compiles
- Dark copies created below frames

---

## Iteration 9: Add Theme Toggle
**Context:** 1100 tokens
**Time:** 10 minutes

### Update ui.html CSS:

```css
#theme { position:absolute; top:8px; right:8px; width:30px; height:30px; background:var(--btn); border:none; cursor:pointer; }
```

### Update ui.html HTML:

```html
<button id="theme" onclick="toggleTheme()">🌙</button>
<div id="bar">...</div>
```

### Update ui.html JavaScript:

```javascript
function toggleTheme() {
  const isDark = document.body.classList.contains("light");
  document.body.classList.toggle("light", isDark);
  document.getElementById("theme").textContent = isDark ? "☀️" : "🌙";
  post("save-theme", { light: !isDark });
}

// Load saved theme
window.addEventListener("load", async () => {
  // Will implement in next iteration
});
```

### Update src/code.ts message handler:

```typescript
if (msg.type === "save-theme") {
  await figma.clientStorage.setAsync("theme", msg.light);
}
```

### Test:
- Theme toggle button appears
- Light/dark mode switches
- Settings saved

---

## Iteration 10: Add Position Picker
**Context:** 1300 tokens
**Time:** 15 minutes

### Update ui.html HTML:

```html
<div id="pos-picker" style="display:none; position:absolute; top:8px; left:8px;">
  <button onclick="setPos('tl')" style="width:16px; height:16px; margin:2px;">↖</button>
  <button onclick="setPos('tr')" style="width:16px; height:16px; margin:2px;">↗</button>
  <button onclick="setPos('bl')" style="width:16px; height:16px; margin:2px;">↙</button>
  <button onclick="setPos('br')" style="width:16px; height:16px; margin:2px;">↘</button>
  <button onclick="setPos('center')" style="width:16px; height:16px; margin:2px;">⊕</button>
</div>
```

### Update ui.html JavaScript:

```javascript
function setPos(pos) {
  post("set-pos", { pos });
}

// Toggle position picker with Settings button (will add in later iteration)
```

### Update src/code.ts:

```typescript
async function repositionUI(pos: string) {
  const viewport = figma.viewport;
  const m = 16 / viewport.zoom;
  let x = 0, y = 0;
  
  switch(pos) {
    case "tl": x = m; y = m; break;
    case "tr": x = viewport.bounds.width - 250 - m; y = m; break;
    case "bl": x = m; y = viewport.bounds.height - 62 - m * 3.5; break;
    case "br": x = viewport.bounds.width - 250 - m; y = viewport.bounds.height - 62 - m * 3.5; break;
    case "center": x = (viewport.bounds.width - 250) / 2; y = (viewport.bounds.height - 62) / 2; break;
  }
  
  figma.ui.moveTo(x, y);
  await figma.clientStorage.setAsync("uiPos", pos);
}

if (msg.type === "set-pos") {
  await repositionUI(msg.pos);
}
```

### Test:
- Position picker controls plugin window position
- Position saved to clientStorage

---

## Iteration 11: Add Move to Zero Function
**Context:** 800 tokens
**Time:** 5 minutes

### Add to src/code.ts:

```typescript
function moveToZero() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Nothing selected");
    return;
  }
  sel[0].x = 0;
  sel[0].y = 0;
  figma.notify("Moved to (0,0)");
}
```

Add to message handler:

```typescript
if (msg.type === "zero") {
  moveToZero();
}
```

### Update ui.html:

```html
<button class="btn" onclick="post('zero')">Zero</button>
```

### Test:
- Zero button moves selected object to (0,0)

---

## Iteration 12: Add Find Similar Function
**Context:** 900 tokens
**Time:** 10 minutes

### Add to src/code.ts:

```typescript
function findSimilar() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) {
    figma.notify("Select exactly 1 object");
    return;
  }
  
  const target = sel[0] as any;
  const similar = figma.currentPage.children.filter((node: any) => 
    node.name === target.name && 
    node.width === target.width && 
    node.height === target.height
  );
  
  figma.currentPage.selection = similar;
  figma.notify(`Found ${similar.length} similar objects`);
}
```

Add to message handler:

```typescript
if (msg.type === "find") {
  findSimilar();
}
```

### Update ui.html:

```html
<button class="btn" onclick="post('find')">Find</button>
```

### Test:
- Find button selects matching objects

---

## Iteration 13: Add Replace Function
**Context:** 1000 tokens
**Time:** 10 minutes

### Add to src/code.ts:

```typescript
let lastAddedId = "";

async function replaceWithInstance() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Nothing selected to replace");
    return;
  }
  
  if (!lastAddedId) {
    figma.notify("No reference object");
    return;
  }
  
  const ref = await figma.getNodeByIdAsync(lastAddedId);
  if (!ref) {
    figma.notify("Reference object not found");
    return;
  }
  
  sel.forEach((target: any) => {
    const copy = (ref as any).clone();
    copy.x = target.x;
    copy.y = target.y;
    target.remove();
  });
  
  figma.notify(`Replaced ${sel.length} objects`);
}

// Track last added
figma.on("selectionchange", () => {
  if (figma.currentPage.selection.length === 1) {
    lastAddedId = figma.currentPage.selection[0].id;
  }
});
```

Add to message handler:

```typescript
if (msg.type === "replace") {
  await replaceWithInstance();
}
```

### Update ui.html:

```html
<button class="btn" onclick="post('replace')">Replace</button>
```

### Test:
- Last selected object becomes reference
- Replace button swaps objects

---

## Iteration 14: Add Expand Section Function
**Context:** 1200 tokens
**Time:** 15 minutes

### Add to src/code.ts:

```typescript
async function expandSection(dir: "left" | "right") {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Select a frame or section");
    return;
  }
  
  const target = sel[0] as any;
  if (dir === "right") {
    // Shift siblings to the right
    const siblings = figma.currentPage.children.filter((n: any) => 
      n.type === "SECTION" && n.x > target.x
    );
    siblings.forEach((s: any) => {
      s.x += target.width + 80;
    });
    target.resizeWithoutConstraints(target.width * 2, target.height);
  } else {
    // Expand left
    target.x -= target.width;
    target.resizeWithoutConstraints(target.width * 2, target.height);
  }
  
  figma.notify(`Expanded ${dir}`);
}
```

Add to message handler:

```typescript
if (msg.type === "expand-right") {
  await expandSection("right");
}
if (msg.type === "expand-left") {
  await expandSection("left");
}
```

### Update ui.html:

```html
<button class="btn" onclick="post('expand-left')">←</button>
<button class="btn" onclick="post('expand-right')">→</button>
```

### Test:
- Expand buttons shift and grow sections

---

## Iteration 15: Add Button Reorder (UI)
**Context:** 1400 tokens
**Time:** 20 minutes

### Update ui.html:

Add this JavaScript:

```javascript
let editMode = false;

function toggleEdit() {
  editMode = !editMode;
  document.body.classList.toggle("edit", editMode);
  
  if (editMode) {
    // Make buttons draggable
    document.querySelectorAll(".btn").forEach(btn => {
      btn.draggable = true;
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("button", btn.textContent);
      });
    });
  }
  
  document.getElementById("edit-btn").textContent = editMode ? "Save" : "Edit";
}
```

Add button:

```html
<button class="btn" id="edit-btn" onclick="toggleEdit()">Edit</button>
```

### Test:
- Edit mode toggles
- Buttons become draggable (basic)

---

## Iteration 16: Add Translation Support (UI)
**Context:** 1300 tokens
**Time:** 15 minutes

### Add to ui.html HTML:

```html
<div id="langs" style="display:none;">
  <button onclick="translate('ru')">🇷🇺 Russian</button>
  <button onclick="translate('en')">🇬🇧 English</button>
  <button onclick="translate('de')">🇩🇪 German</button>
  <button onclick="translate('fr')">🇫🇷 French</button>
  <button onclick="translate('ja')">🇯🇵 Japanese</button>
</div>
```

Add to JavaScript:

```javascript
function showTranslate() {
  const langs = document.getElementById("langs");
  langs.style.display = langs.style.display === "none" ? "block" : "none";
}

function translate(lang) {
  post("translate", { lang });
  document.getElementById("langs").style.display = "none";
}
```

Add button:

```html
<button class="btn" onclick="showTranslate()">🌐</button>
```

### Update src/code.ts message handler:

```typescript
if (msg.type === "translate") {
  // Will be implemented in next iteration
  figma.notify(`Translating to ${msg.lang}`);
}
```

### Test:
- Language selector appears
- Messages posted to plugin

---

## Iteration 17: Add Translation Function
**Context:** 1200 tokens
**Time:** 15 minutes

### Add to src/code.ts:

```typescript
async function translateSelection(lang: string) {
  const texts: any[] = [];
  
  function collectTexts(node: any) {
    if (node.type === "TEXT") {
      texts.push({ id: node.id, text: node.characters });
    }
    if ("children" in node) {
      node.children.forEach((child: any) => collectTexts(child));
    }
  }
  
  figma.currentPage.selection.forEach((node: any) => collectTexts(node));
  
  if (texts.length === 0) {
    figma.notify("No text layers found");
    return;
  }
  
  figma.notify(`Found ${texts.length} text layers, translating...`);
  
  // Post to UI for translation
  figma.ui.postMessage({
    type: "translate-request",
    texts,
    lang
  });
}

if (msg.type === "translate") {
  await translateSelection(msg.lang);
}
```

### Test:
- Translation request posted
- Text layers collected

---

## Iteration 18: Add Settings Panel (Collapsible)
**Context:** 1500 tokens
**Time:** 20 minutes

### Update ui.html HTML:

```html
<div id="settings" style="display:none; position:absolute; top:60px; left:0; width:250px; background:var(--bg); border:1px solid var(--btn); padding:8px;">
  <div style="font-size:11px; margin:4px 0;">Position:</div>
  <button onclick="setPos('tl')" style="width:30px;">↖</button>
  <button onclick="setPos('tr')" style="width:30px;">↗</button>
  <button onclick="setPos('bl')" style="width:30px;">↙</button>
  <button onclick="setPos('br')" style="width:30px;">↘</button>
  <button onclick="setPos('center')" style="width:100%;margin-top:4px;">Center</button>
  <hr style="margin:8px 0;border:none;border-top:1px solid var(--btn);">
  <button onclick="post('reset')" style="width:100%;">Reset All</button>
</div>
```

Add to JavaScript:

```javascript
function toggleSettings() {
  const settings = document.getElementById("settings");
  settings.style.display = settings.style.display === "none" ? "block" : "none";
}
```

Add Settings button:

```html
<button class="btn" onclick="toggleSettings()">⚙️</button>
```

### Test:
- Settings panel opens/closes
- Position buttons work
- Reset button visible

---

## Iteration 19: Add Reset Function
**Context:** 900 tokens
**Time:** 10 minutes

### Add to src/code.ts:

```typescript
async function resetAll() {
  await figma.clientStorage.setAsync("theme", false);
  await figma.clientStorage.setAsync("uiPos", "center");
  await figma.clientStorage.setAsync("order", []);
  figma.notify("All settings reset");
}

if (msg.type === "reset") {
  await resetAll();
}
```

### Update ui.html:

```javascript
// Modify reset button:
document.querySelector("button[onclick=\"post('reset')\"]").textContent = "Reset All";
```

### Test:
- Reset clears all settings
- Plugin returns to default state

---

## Iteration 20: Polish & Export
**Context:** 1000 tokens
**Time:** 10 minutes

### Final checks:

1. **Compile:** `npm run build` ✓
2. **Test in Figma:** Load plugin ✓
3. **All buttons work** ✓
4. **Theme toggling** ✓
5. **Position saving** ✓
6. **Selection info** ✓

### Create README.md:

```markdown
# Kiss Booster Figma Plugin

## Features
- Wrap frames into sections
- Fix section alignment
- Align all sections in grid
- Expand sections left/right
- Find similar objects
- Replace with instance
- Move to (0,0)
- Translate text
- Theme toggle
- Position picker
- Settings panel

## Build
\`\`\`bash
npm install
npm run build
\`\`\`

## Load
Figma → Plugins → Development → Import plugin from manifest.json
```

### Final test:
- Plugin loads
- All features work
- No console errors

---

## Key Rules for Model

**For each iteration:**

1. ✅ Only add code shown
2. ✅ Compile after each iteration
3. ✅ Test immediately in Figma
4. ✅ NO refactoring
5. ✅ NO cleanup
6. ✅ NO combining iterations

**If error:**
- Show error message exactly
- Fix ONLY that error
- Recompile
- Test again

**DO NOT:**
- ❌ Skip iterations
- ❌ Combine iterations
- ❌ Modify other code
- ❌ Add features not in iteration
- ❌ Change function signatures
