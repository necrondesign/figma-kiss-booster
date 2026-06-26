# Kiss Booster — Build from Scratch for 9B Models
**One file. No compilation steps. Just code.**

---

## IMPORTANT RULES
1. **DO ONLY ONE ITERATION AT A TIME**
2. **ONLY WRITE CODE SHOWN** — no changes
3. **NO `npm run build` — user will do that**
4. **NO `Test in Figma` — user will do that**
5. **Just write code. That's it.**

When iteration is done, WAIT for user to say "next"

---

## ITERATION 1

**Create 3 files:**

**File: manifest.json**
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

**File: package.json**
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

**File: tsconfig.json**
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

✅ **Done. Wait for next iteration.**

---

## ITERATION 2

**File: src/code.ts**
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

✅ **Done. Wait for next iteration.**

---

## ITERATION 3

**File: ui.html**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { --bg:#2c2c2c; --btn:#383838; --txt:#fff; }
    body.light { --bg:#fff; --btn:#ebebeb; --txt:#1e1e1e; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:var(--bg); color:var(--txt); font-family:system-ui; font-size:11px; }
    #bar { display:flex; gap:4px; padding:6px; width:max-content; }
    .btn { width:60px; height:50px; background:var(--btn); border:none; color:var(--txt); cursor:pointer; border-radius:4px; font-size:10px; }
    .btn:hover { opacity:0.8; }
  </style>
</head>
<body>
  <div id="bar">
    <button class="btn" onclick="post('wrap')">Wrap</button>
  </div>

  <script>
    function post(type, data) {
      parent.postMessage({ pluginMessage: Object.assign({ type }, data || {}) }, '*');
    }

    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (msg && msg.type === "selection-info") {
        console.log("Selection:", msg.count);
      }
    };
  </script>
</body>
</html>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 4

**Update: src/code.ts**

Add this function AFTER constants:

```typescript
async function wrapFrames() {
  const frames = figma.currentPage.selection.filter((n: any) => n.type === "FRAME");
  
  if (frames.length === 0) {
    figma.notify("No frames selected");
    return;
  }

  frames.forEach((frame: any, i: number) => {
    frame.x = i * (frame.width + H_GAP);
  });

  const section = figma.createSection();
  section.x = 0;
  section.y = 0;
  frames.forEach((f: any) => {
    section.appendChild(f);
  });

  figma.notify(`Wrapped ${frames.length} frames`);
}
```

Replace the message handler with:

```typescript
figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "wrap") {
    await wrapFrames();
  }
};
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 5

**Update: src/code.ts**

Add this function AFTER wrapFrames:

```typescript
async function fixSection() {
  const sections = figma.currentPage.selection.filter((n: any) => n.type === "SECTION");
  
  if (sections.length === 0) {
    figma.notify("No section selected");
    return;
  }

  const section = sections[0] as any;
  
  const toDel = section.children.filter((c: any) => c.name.includes(" — Dark"));
  toDel.forEach((c: any) => c.remove());

  const light = section.children.filter((c: any) => !c.name.includes(" — Dark"));
  light.forEach((f: any, i: number) => {
    f.x = i * (f.width + H_GAP);
  });

  figma.notify("Section fixed");
}
```

Add this to message handler:

```typescript
if (msg.type === "fix") {
  await fixSection();
}
```

**Update: ui.html**

Add button in #bar:

```html
<button class="btn" onclick="post('fix')">Fix</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 6

**Update: src/code.ts**

Add function AFTER fixSection:

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

**Update: ui.html**

Add button:

```html
<button class="btn" onclick="post('align')">Align</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 7

**Update: src/code.ts**

Add function AFTER alignSectionsInGrid:

```typescript
async function findDarkMode(): Promise<any> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const col of collections) {
    const dark = col.modes.find((m: any) => m.name.toLowerCase() === "dark");
    if (dark) return { collection: col, modeId: dark.modeId };
  }
  return null;
}
```

Add function:

```typescript
async function createDarkCopy(frame: any): Promise<void> {
  const copy = frame.clone();
  copy.name = frame.name + " — Dark";
  copy.y = frame.y + frame.height + V_GAP;
}
```

Update wrapFrames function. FIND:

```typescript
figma.notify(`Wrapped ${frames.length} frames`);
```

REPLACE with:

```typescript
for (const f of frames) {
  await createDarkCopy(f);
}

figma.notify(`Wrapped ${frames.length} frames with dark copies`);
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 8

**Update: src/code.ts**

Add function AFTER createDarkCopy:

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

**Update: ui.html**

Add button:

```html
<button class="btn" onclick="post('zero')">Zero</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 9

**Update: src/code.ts**

Add function AFTER moveToZero:

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

**Update: ui.html**

Add button:

```html
<button class="btn" onclick="post('find')">Find</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 10

**Update: src/code.ts**

Add AFTER constants:

```typescript
let lastAddedId = "";
```

Add function AFTER findSimilar:

```typescript
async function replaceWithInstance() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Nothing selected");
    return;
  }
  
  if (!lastAddedId) {
    figma.notify("No reference object");
    return;
  }
  
  const ref = await figma.getNodeByIdAsync(lastAddedId);
  if (!ref) {
    figma.notify("Reference not found");
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
```

Add to message handler:

```typescript
if (msg.type === "replace") {
  await replaceWithInstance();
}
```

UPDATE the selectionchange listener. FIND:

```typescript
figma.on("selectionchange", () => {
  figma.ui.postMessage({ 
    type: "selection-info",
    count: figma.currentPage.selection.length
  });
});
```

REPLACE with:

```typescript
figma.on("selectionchange", () => {
  if (figma.currentPage.selection.length === 1) {
    lastAddedId = figma.currentPage.selection[0].id;
  }
  figma.ui.postMessage({ 
    type: "selection-info",
    count: figma.currentPage.selection.length
  });
});
```

**Update: ui.html**

Add button:

```html
<button class="btn" onclick="post('replace')">Replace</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 11

**Update: src/code.ts**

Add function AFTER replaceWithInstance:

```typescript
async function expandSection(dir: "left" | "right") {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Select a frame or section");
    return;
  }
  
  const target = sel[0] as any;
  if (dir === "right") {
    const siblings = figma.currentPage.children.filter((n: any) => 
      n.x > target.x
    );
    siblings.forEach((s: any) => {
      s.x += target.width + 80;
    });
    target.resizeWithoutConstraints(target.width * 2, target.height);
  } else {
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

**Update: ui.html**

Add buttons:

```html
<button class="btn" onclick="post('expand-left')">←</button>
<button class="btn" onclick="post('expand-right')">→</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 12

**Update: src/code.ts**

Add function AFTER expandSection:

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
  
  figma.notify(`Found ${texts.length} text layers`);
}
```

Add to message handler:

```typescript
if (msg.type === "translate") {
  await translateSelection(msg.lang);
}
```

**Update: ui.html**

Add to HTML before closing #bar:

```html
<button class="btn" onclick="showLangs()">🌐</button>
<div id="langs" style="display:none; position:absolute; top:60px; left:0; background:var(--btn); padding:4px; border-radius:4px;">
  <button style="width:100%; text-align:left; padding:4px; margin:2px 0; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('translate', {lang: 'ru'})">🇷🇺 Russian</button>
  <button style="width:100%; text-align:left; padding:4px; margin:2px 0; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('translate', {lang: 'en'})">🇬🇧 English</button>
  <button style="width:100%; text-align:left; padding:4px; margin:2px 0; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('translate', {lang: 'de'})">🇩🇪 German</button>
  <button style="width:100%; text-align:left; padding:4px; margin:2px 0; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('translate', {lang: 'fr'})">🇫🇷 French</button>
  <button style="width:100%; text-align:left; padding:4px; margin:2px 0; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('translate', {lang: 'ja'})">🇯🇵 Japanese</button>
</div>
```

Add to JavaScript:

```javascript
function showLangs() {
  const langs = document.getElementById("langs");
  langs.style.display = langs.style.display === "none" ? "block" : "none";
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 13

**Update: src/code.ts**

Add function AFTER translateSelection:

```typescript
async function saveTheme(light: boolean) {
  await figma.clientStorage.setAsync("theme", light);
}

async function getTheme(): Promise<boolean> {
  return await figma.clientStorage.getAsync("theme") || false;
}
```

Add to message handler:

```typescript
if (msg.type === "save-theme") {
  await saveTheme(msg.light);
}
if (msg.type === "get-theme") {
  const light = await getTheme();
  figma.ui.postMessage({ type: "theme-response", light });
}
```

**Update: ui.html**

Add to HTML (before #bar):

```html
<button id="theme-btn" style="position:absolute; top:8px; right:8px; width:30px; height:30px; background:var(--btn); border:none; cursor:pointer; border-radius:4px; color:var(--txt); font-size:14px;" onclick="toggleTheme()">🌙</button>
```

Add to JavaScript:

```javascript
let isDarkTheme = true;

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle("light", isDarkTheme);
  document.getElementById("theme-btn").textContent = isDarkTheme ? "🌙" : "☀️";
  post("save-theme", { light: !isDarkTheme });
}

// Load saved theme on start
window.addEventListener("load", async () => {
  post("get-theme");
});

// Handle theme response
window.onmessage = (e) => {
  const msg = e.data.pluginMessage;
  if (msg && msg.type === "theme-response") {
    isDarkTheme = !msg.light;
    toggleTheme();
  }
  if (msg && msg.type === "selection-info") {
    console.log("Selection:", msg.count);
  }
};
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 14

**Update: src/code.ts**

Add function AFTER getTheme:

```typescript
async function repositionUI(pos: string) {
  const viewport = figma.viewport;
  const m = 16 / viewport.zoom;
  const bounds = viewport.bounds;
  let x = 0, y = 0;
  
  switch(pos) {
    case "tl": x = m; y = m; break;
    case "tr": x = bounds.width - 250 - m; y = m; break;
    case "bl": x = m; y = bounds.height - 62 - m * 3.5; break;
    case "br": x = bounds.width - 250 - m; y = bounds.height - 62 - m * 3.5; break;
    case "center": x = (bounds.width - 250) / 2; y = (bounds.height - 62) / 2; break;
  }
  
  figma.ui.moveTo(x, y);
  await figma.clientStorage.setAsync("uiPos", pos);
}

async function getPosition(): Promise<string> {
  return await figma.clientStorage.getAsync("uiPos") || "center";
}
```

Add to message handler:

```typescript
if (msg.type === "set-pos") {
  await repositionUI(msg.pos);
}
if (msg.type === "get-pos") {
  const pos = await getPosition();
  figma.ui.postMessage({ type: "pos-response", pos });
}
```

Add on startup (AFTER the selectionchange listener):

```typescript
(async () => {
  const pos = await getPosition();
  await repositionUI(pos);
})();
```

**Update: ui.html**

Add to HTML (before #bar):

```html
<div id="pos-picker" style="position:absolute; top:40px; left:8px; display:none; background:var(--btn); padding:4px; border-radius:4px;">
  <button style="width:20px; height:20px; margin:2px; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('set-pos', {pos: 'tl'})">↖</button><br>
  <button style="width:20px; height:20px; margin:2px; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('set-pos', {pos: 'tr'})">↗</button><br>
  <button style="width:20px; height:20px; margin:2px; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('set-pos', {pos: 'bl'})">↙</button><br>
  <button style="width:20px; height:20px; margin:2px; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('set-pos', {pos: 'br'})">↘</button><br>
  <button style="width:40px; height:20px; margin:2px; background:transparent; border:none; color:var(--txt); cursor:pointer;" onclick="post('set-pos', {pos: 'center'})">⊕</button>
</div>
<button id="pos-btn" style="position:absolute; top:8px; left:8px; width:30px; height:30px; background:var(--btn); border:none; cursor:pointer; border-radius:4px; color:var(--txt);" onclick="togglePos()">📍</button>
```

Add to JavaScript:

```javascript
function togglePos() {
  const picker = document.getElementById("pos-picker");
  picker.style.display = picker.style.display === "none" ? "block" : "none";
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 15

**Update: src/code.ts**

Add function AFTER getPosition:

```typescript
async function saveOrder(order: string[]) {
  await figma.clientStorage.setAsync("order", order);
}

async function getOrder(): Promise<string[]> {
  return await figma.clientStorage.getAsync("order") || [];
}

async function resetAll() {
  await figma.clientStorage.setAsync("theme", false);
  await figma.clientStorage.setAsync("uiPos", "center");
  await figma.clientStorage.setAsync("order", []);
  figma.notify("All settings reset");
}
```

Add to message handler:

```typescript
if (msg.type === "save-order") {
  await saveOrder(msg.order);
}
if (msg.type === "get-order") {
  const order = await getOrder();
  figma.ui.postMessage({ type: "order-response", order });
}
if (msg.type === "reset") {
  await resetAll();
}
```

**Update: ui.html**

Add to HTML (before #bar):

```html
<div id="settings" style="position:absolute; top:60px; left:0; width:200px; background:var(--btn); padding:8px; border-radius:4px; display:none;">
  <div style="font-size:10px; margin-bottom:8px; font-weight:bold;">Settings</div>
  <button style="width:100%; padding:4px; margin:4px 0; background:var(--bg); border:none; color:var(--txt); cursor:pointer; border-radius:2px;" onclick="post('reset')">Reset All</button>
  <button style="width:100%; padding:4px; margin:4px 0; background:var(--bg); border:none; color:var(--txt); cursor:pointer; border-radius:2px;" onclick="toggleSettings()">Close</button>
</div>
<button id="settings-btn" style="position:absolute; top:8px; right:40px; width:30px; height:30px; background:var(--btn); border:none; cursor:pointer; border-radius:4px; color:var(--txt); font-size:14px;" onclick="toggleSettings()">⚙️</button>
```

Add to JavaScript:

```javascript
function toggleSettings() {
  const settings = document.getElementById("settings");
  settings.style.display = settings.style.display === "none" ? "block" : "none";
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 16

**Update: src/code.ts**

Add function AFTER resetAll:

```typescript
async function createArtTask(source: any, targetSize: any) {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Select art task and target");
    return;
  }

  const artTask = sel[0] as any;
  if (!artTask) {
    figma.notify("No art task found");
    return;
  }

  const size = `${source.width}×${source.height}px`;
  const size3x = `${source.width * 3}×${source.height * 3}px`;
  
  figma.notify(`Art task updated: ${size} and ${size3x}`);
}
```

Add to message handler:

```typescript
if (msg.type === "art-block") {
  const sel = figma.currentPage.selection;
  if (sel.length > 0) {
    await createArtTask(sel[0], null);
  }
}
```

**Update: ui.html**

Add button:

```html
<button class="btn" onclick="post('art-block')">Art</button>
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 17

**Update: ui.html**

Add to HTML in #bar:

```html
<button class="btn" onclick="toggleEdit()" id="edit-btn">Edit</button>
```

Add to JavaScript:

```javascript
let editMode = false;

function toggleEdit() {
  editMode = !editMode;
  document.getElementById("edit-btn").textContent = editMode ? "Save" : "Edit";
  
  if (editMode) {
    document.querySelectorAll(".btn").forEach(btn => {
      btn.draggable = true;
      btn.style.cursor = "grab";
    });
  } else {
    document.querySelectorAll(".btn").forEach(btn => {
      btn.draggable = false;
      btn.style.cursor = "pointer";
    });
  }
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 18

**Update: ui.html**

Add to HTML in #bar:

```html
<button class="btn" onclick="post('frame-540')">540px</button>
```

**Update: src/code.ts**

Add function AFTER createArtTask:

```typescript
async function wrapIn540px() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Nothing selected");
    return;
  }

  const frame = figma.createFrame();
  frame.resizeWithoutConstraints(540, 100);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";

  sel.forEach((node: any) => {
    frame.appendChild(node);
  });

  figma.notify("Wrapped in 540px frame");
}
```

Add to message handler:

```typescript
if (msg.type === "frame-540") {
  await wrapIn540px();
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 19

**Update: ui.html**

Add to HTML in #bar:

```html
<button class="btn" onclick="post('frame-border')">1px</button>
```

**Update: src/code.ts**

Add function AFTER wrapIn540px:

```typescript
async function addFrameBorder() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Nothing selected");
    return;
  }

  sel.forEach((node: any) => {
    const border = figma.createFrame();
    border.resizeWithoutConstraints(node.width + 2, node.height + 2);
    border.strokeWeight = 1;
    border.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    border.x = node.x - 1;
    border.y = node.y - 1;
    border.appendChild(node);
  });

  figma.notify("Added 1px borders");
}
```

Add to message handler:

```typescript
if (msg.type === "frame-border") {
  await addFrameBorder();
}
```

✅ **Done. Wait for next iteration.**

---

## ITERATION 20

**Update: ui.html**

Add to HTML in #bar:

```html
<button class="btn" onclick="post('greed')">Greed</button>
```

**Update: src/code.ts**

Add function AFTER addFrameBorder:

```typescript
async function greedButton() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify("Greed: Nothing selected");
    return;
  }

  figma.notify("Greed mode: ready");
}
```

Add to message handler:

```typescript
if (msg.type === "greed") {
  await greedButton();
}
```

✅ **DONE. ALL 20 ITERATIONS COMPLETE.**

---

## Final Checklist

- [ ] All 20 iterations completed
- [ ] `npm run build` succeeds (compile locally)
- [ ] `dist/src/code.js` created
- [ ] Plugin loads in Figma
- [ ] All buttons work
- [ ] Selection info updates
- [ ] Theme toggle works
- [ ] Position picker works
- [ ] Settings panel works
- [ ] Reset works
