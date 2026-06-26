# Kiss Booster Fix — Step-by-Step Instructions for Small Model (9B+)

## ⚠️ CRITICAL RULES

1. **FOLLOW EVERY STEP IN ORDER** — don't skip, don't combine, don't reorder
2. **BE EXACT** — use exact function names, exact API calls, exact file paths
3. **NO MODIFICATIONS BEYOND THE STEP** — only do what the step says
4. **DELETE AFTER EACH STEP** — remove old fragments
5. **TEST AFTER EACH STEP** — verify file is valid TypeScript/HTML

---

## STEP 1: Clean Up File Fragments
**Goal:** Remove all temporary files that are NOT code.ts or ui.html

**Exact Actions:**
1. Delete these files from `/src/`:
   - code_append_step18.ts
   - code_append_step19.ts
   - code_append_step20.ts
   - code_append_step21.ts
   - code_append_step21_fixed.ts
   - code_append_step22.ts
   - code_append_step23.ts
   - code_append_step24.ts
   - code_append_step25.ts
   - code_append_step26.ts
   - code_append_step27.ts
   - code_append_step28.ts
   - code_append_step29.ts
   - code_append_step30.ts
   - code_append_step31_summary.ts
   - code_step21.ts

2. Keep ONLY:
   - code.ts
   - ui.html
   - types.d.ts (if exists)

**Verification:** `ls -la src/` should show only 3 .ts files + 1 .html file

---

## STEP 2: Fix manifest.json
**Goal:** Replace entire manifest with correct Figma plugin format

**File:** `manifest.json`

**DELETE everything and write EXACTLY:**
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

**NO CHANGES** — copy/paste exactly as shown

---

## STEP 3: Fix tsconfig.json
**Goal:** Ensure TypeScript compiles to ES2019 target

**File:** `tsconfig.json`

**DELETE everything and write EXACTLY:**
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "commonjs",
    "lib": ["ES2019", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/code.ts"],
  "exclude": ["node_modules"]
}
```

**NO CHANGES** — copy/paste exactly

---

## STEP 4: Fix package.json
**Goal:** Ensure build script outputs to correct directory

**File:** `package.json`

**REPLACE the entire scripts section with:**
```json
{
  "name": "kiss-booster",
  "version": "1.0.0",
  "description": "Figma plugin for accelerating design workflows",
  "main": "dist/src/code.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^4.9.0",
    "@figma/plugin-typings": "latest"
  }
}
```

**KEEP THE REST** — only modify scripts section

---

## STEP 5: Start Fresh code.ts
**Goal:** Replace entire code.ts with skeleton (constants only, no functions yet)

**File:** `src/code.ts`

**DELETE everything and write EXACTLY:**
```typescript
// KISS Booster — Figma Plugin
// Main plugin logic that runs in Figma sandbox

const H_GAP = 80;               // Horizontal spacing between frames
const V_GAP = 160;              // Vertical spacing for dark copies
const SECTION_PADDING = 100;    // Section auto-layout padding
const SECTION_GAP = 400;        // Spacing between aligned sections
const FRAME_FIXED_WIDTH = 540;  // Fixed width for 540px frame

// ============================================================
// MESSAGE HANDLER (empty, will be filled in next steps)
// ============================================================

figma.showUI(__html__, { width: 250, height: 62, themeColors: true });

figma.ui.onmessage = async (msg: { type: string }) => {
  // Message handler will be implemented step by step
};
```

**Save and compile with `npm run build`**

---

## STEP 6: Add Helper Functions (Part 1)
**Goal:** Add 3 core helper functions

**File:** `src/code.ts`

**INSERT AFTER constants, BEFORE message handler:**
```typescript
// ============================================================
// HELPER FUNCTIONS
// ============================================================

function sendStatus(text: string, status: "success" | "error" | "") {
  figma.ui.postMessage({ type: "status", text, status });
  if (text) {
    figma.notify(text, status === "error" ? { error: true } : undefined);
  }
}

async function findDarkMode(): Promise<{ collection: VariableCollection; modeId: string } | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    const darkMode = collection.modes.find((m) => m.name.toLowerCase() === "dark");
    if (darkMode) {
      return { collection, modeId: darkMode.modeId };
    }
  }
  return null;
}

async function findVariable(name: string): Promise<Variable | null> {
  const allVars = await figma.variables.getLocalVariablesAsync();
  const exact = allVars.find((v) => v.name === name);
  if (exact) return exact as Variable;
  const byEnd = allVars.find((v) => v.name.endsWith("/" + name));
  if (byEnd) return byEnd as Variable;
  const partial = allVars.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
  if (partial) return partial as Variable;
  figma.notify(`⚠ "${name}" not found`, { timeout: 5000 });
  return null;
}
```

**Save and compile** — should have NO errors

---

## STEP 7: Add Selection Helper Functions
**Goal:** Add functions to filter selected nodes

**File:** `src/code.ts`

**INSERT after helper functions from STEP 6:**
```typescript
function getSelectedFrames(): FrameNode[] {
  return figma.currentPage.selection.filter((n) => n.type === "FRAME") as FrameNode[];
}

function getSelectedSections(): SectionNode[] {
  return figma.currentPage.selection.filter((n) => n.type === "SECTION") as SectionNode[];
}
```

**Save and compile** — should have NO errors

---

## STEP 8: Add Wrap Function
**Goal:** Implement wrapFrames(withDark) function

**File:** `src/code.ts`

**INSERT after selection helpers:**
```typescript
async function wrapFrames(withDark: boolean): Promise<string> {
  const frames = getSelectedFrames();
  if (frames.length === 0) {
    sendStatus("No frames selected", "error");
    return "";
  }

  // Align frames horizontally with H_GAP spacing
  frames.forEach((frame, index) => {
    frame.x = index * (frame.width + H_GAP);
  });

  // Create Section
  const section = figma.createSection();
  section.resizeWithoutConstraints(
    frames[0].width + (frames.length - 1) * (frames[0].width + H_GAP) + SECTION_PADDING,
    frames[0].height + SECTION_PADDING
  );
  section.x = frames[0].x;
  section.y = frames[0].y;

  // Add frames to section
  section.appendChild(frames[0].parent as any);
  frames.forEach((frame) => {
    section.appendChild(frame);
  });

  sendStatus(`Wrapped ${frames.length} frames`, "success");
  return section.id;
}
```

**Save and compile** — should have NO errors

---

## STEP 9: Add Fix Section Function
**Goal:** Implement fixSection(withDark) function

**File:** `src/code.ts`

**INSERT after wrapFrames:**
```typescript
async function fixSection(withDark: boolean): Promise<void> {
  const sections = getSelectedSections();
  if (sections.length === 0) {
    sendStatus("No section selected", "error");
    return;
  }

  const section = sections[0];
  
  // Remove dark copies
  const toDelete = section.children.filter((child) => child.name.includes(" — Dark"));
  toDelete.forEach((child) => child.remove());

  // Re-align light frames
  const lightFrames = section.children.filter((child) => !child.name.includes(" — Dark"));
  lightFrames.forEach((frame, index) => {
    frame.x = index * ((frame as FrameNode).width + H_GAP);
  });

  // Resize section
  const maxWidth = lightFrames.reduce((sum, f) => sum + (f as FrameNode).width + H_GAP, 0);
  const maxHeight = Math.max(...lightFrames.map((f) => (f as FrameNode).height));
  section.resizeWithoutConstraints(maxWidth + SECTION_PADDING, maxHeight + SECTION_PADDING);

  sendStatus("Section fixed", "success");
}
```

**Save and compile** — should have NO errors

---

## STEP 10: Add Align Sections Function
**Goal:** Implement alignSectionsInGrid(sections, startX, startY)

**File:** `src/code.ts`

**INSERT after fixSection:**
```typescript
function alignSectionsInGrid(sections: SectionNode[], startX: number, startY: number): void {
  const perRow = 6;
  let x = startX;
  let y = startY;
  let rowHeight = 0;

  sections.forEach((section, index) => {
    if (index > 0 && index % perRow === 0) {
      // Move to next row
      x = startX;
      y += rowHeight + SECTION_GAP;
      rowHeight = 0;
    }

    section.x = x;
    section.y = y;
    x += section.width + SECTION_GAP;
    rowHeight = Math.max(rowHeight, section.height);
  });
}

async function alignSectionsCmd(): Promise<void> {
  const sections = getSelectedSections();
  if (sections.length === 0) {
    sendStatus("No sections selected", "error");
    return;
  }
  alignSectionsInGrid(sections, 0, 0);
  sendStatus("Sections aligned", "success");
}
```

**Save and compile** — should have NO errors

---

## STEP 11: Add Selection Info Listener
**Goal:** Send selection info to UI on every change

**File:** `src/code.ts`

**INSERT BEFORE the message handler (after all functions):**
```typescript
// Send selection info to UI
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  const info = {
    count: selection.length,
    hasSection: selection.some((n) => n.type === "SECTION"),
    hasFrames: selection.some((n) => n.type === "FRAME"),
    allDark: selection.every((n) => n.name.includes(" — Dark")),
    hasAny: selection.length > 0,
    textCount: 0, // placeholder
  };
  figma.ui.postMessage({ type: "selection-info", ...info });
});
```

**Save and compile** — should have NO errors

---

## STEP 12: Add Message Handler
**Goal:** Replace empty message handler with actual commands

**File:** `src/code.ts`

**FIND AND REPLACE the message handler (around line 150):**
```typescript
figma.ui.onmessage = async (msg: { type: string }) => {
  switch (msg.type) {
    case "wrap-selection":
      await wrapFrames(true);
      break;
    case "wrap-selection-light":
      await wrapFrames(false);
      break;
    case "fix-selection":
      await fixSection(true);
      break;
    case "fix-selection-light":
      await fixSection(false);
      break;
    case "align-sections":
      await alignSectionsCmd();
      break;
    case "set-pos":
      figma.clientStorage.setAsync("uiPos", msg.pos);
      break;
    case "save-theme":
      figma.clientStorage.setAsync("theme", msg.light);
      break;
    case "get-theme":
      const theme = await figma.clientStorage.getAsync("theme");
      figma.ui.postMessage({ type: "theme", light: theme });
      break;
    case "get-order":
      const order = await figma.clientStorage.getAsync("order");
      figma.ui.postMessage({ type: "order", order });
      break;
    case "save-order":
      figma.clientStorage.setAsync("order", msg.order);
      break;
    case "reset-all":
      figma.clientStorage.setAsync("theme", false);
      figma.clientStorage.setAsync("uiPos", "center");
      figma.clientStorage.setAsync("order", []);
      break;
    case "resize":
      figma.ui.resize(msg.width || 250, msg.height || 62);
      break;
    case "notify":
      figma.notify(msg.text, msg.error ? { error: true } : undefined);
      break;
  }
};
```

**Save and compile** — should have NO errors

---

## STEP 13: Verify code.ts Compilation
**Goal:** Ensure code.ts has NO errors

**Exact Actions:**
1. Run: `npm run build`
2. Check: No error messages
3. Check: `dist/src/code.js` was created
4. Check file size: should be > 10KB

**If errors:** Show error message, fix ONLY that error, recompile

---

## STEP 14: Rewrite ui.html (Structure Only)
**Goal:** Create correct HTML structure with NO JavaScript yet

**File:** `src/ui.html`

**DELETE everything and write EXACTLY:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }

    :root {
      --bg:#2c2c2c; --btn:#383838; --btn-hover:#444;
      --txt:#fff; --icon:rgba(255,255,255,.85); --label:rgba(255,255,255,.5);
    }
    body.light {
      --bg:#ffffff; --btn:#ebebeb; --btn-hover:#dedede;
      --txt:#1e1e1e; --icon:rgba(0,0,0,.8); --label:rgba(0,0,0,.55);
    }

    body {
      font-family:'Inter', system-ui, -apple-system, sans-serif;
      font-size:11px; color:var(--txt); background:var(--bg); overflow:hidden;
      transition:background .15s;
    }

    #bar {
      display:flex; align-items:flex-start; gap:4px; padding:6px; width:max-content;
    }

    .tool-btn {
      width:64px; height:50px; border:none; border-radius:6px; background:var(--btn);
      cursor:pointer; display:flex; flex-direction:column; align-items:flex-start;
      justify-content:space-between; padding:6px 0 6px 8px; flex-shrink:0;
      transition:background .12s;
    }
    .tool-btn:hover { background:var(--btn-hover); }
    .tool-btn:disabled { opacity:.35; cursor:default; }
    .tool-btn.primary { background:#0c8ce9; }

    .btn-icon { display:inline-flex; }
    .btn-label { font-size:10px; color:var(--label); white-space:nowrap; }

    body:not(.open) .tool-btn.extra { display:none; }
    body.open .arrow-btn svg { transform:rotate(180deg); }
  </style>
</head>
<body>
  <div id="bar"></div>
  <div id="faq" style="display:none; flex-direction:column; height:100vh;"></div>

  <script>
    function post(type, extra) {
      parent.postMessage({ pluginMessage: Object.assign({ type }, extra || {}) }, '*');
    }

    function fitSize() {
      const bar = document.getElementById('bar');
      const r = bar.getBoundingClientRect();
      post('resize', { width: Math.ceil(r.width) + 1, height: Math.ceil(r.height) });
    }

    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (!msg) return;
      console.log("UI received:", msg.type);
    };

    // Initialize
    fitSize();
  </script>
</body>
</html>
```

**Save** — HTML should have NO syntax errors

---

## STEP 15: Add UI Tool Definitions
**Goal:** Define TOOLS array with button definitions

**File:** `src/ui.html`

**INSERT in <script> tag, BEFORE window.onmessage:**
```javascript
const IC = {
  frame: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V3h3M12 3h4v3M16 12v3h-4M6 15H2v-3"/></svg>',
  align: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="4" x2="15" y2="4"/><line x1="3" y1="9" x2="11" y2="9"/><line x1="3" y1="14" x2="13" y2="14"/></svg>',
  target: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33"/></svg>',
};

const TOOLS = [
  { id:'wrap', icon: IC.frame, label: 'Wrap', cmd: 'wrap-selection', primary: true },
  { id:'align', icon: IC.align, label: 'Align', cmd: 'align-sections' },
  { id:'zero', icon: IC.target, label: 'Zero', cmd: 'move-to-zero', extra: true },
  { id:'settings', icon: IC.gear, label: 'Settings', settingsBtn: true },
];

let selInfo = { count:0, hasSection:false, hasFrames:false, hasAny:false };

function buildToolbar() {
  const bar = document.getElementById('bar');
  bar.innerHTML = '';
  TOOLS.forEach((t) => {
    if (t.settingsBtn) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn' + (t.extra ? ' extra' : '') + (t.primary ? ' primary' : '');
    btn.innerHTML = `<span class="btn-icon">${t.icon}</span><span class="btn-label">${t.label}</span>`;
    btn.onclick = () => post(t.cmd);
    bar.appendChild(btn);
  });
  const arrow = document.createElement('button');
  arrow.className = 'arrow-btn';
  arrow.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4"/></svg>';
  arrow.onclick = () => document.body.classList.toggle('open');
  bar.appendChild(arrow);
  fitSize();
}

buildToolbar();
```

**Save** — should have NO syntax errors

---

## STEP 16: Add Selection Info Handler
**Goal:** Handle selection-info messages from plugin

**File:** `src/ui.html`

**INSERT in window.onmessage handler:**
```javascript
window.onmessage = (e) => {
  const msg = e.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'selection-info') {
    selInfo = msg;
    console.log("Selection updated:", selInfo);
  }
};
```

**Save** — should have NO syntax errors

---

## STEP 17: Verify ui.html
**Goal:** Ensure ui.html is valid HTML/JavaScript

**Exact Actions:**
1. Open DevTools browser console
2. Load ui.html locally
3. Check: No error messages in console
4. Check: buildToolbar() was called
5. Check: Buttons are visible

---

## STEP 18: Test Complete Plugin
**Goal:** Verify plugin works end-to-end

**Exact Actions:**
1. Run: `npm run build`
2. Check: No compiler errors
3. Check: `dist/src/code.js` exists
4. Open Figma
5. Plugins → Development → Import plugin from manifest.json
6. Select this project's manifest.json
7. Open plugin window
8. Check: Toolbar appears with buttons
9. Click any button
10. Check: No errors in console

---

## STEP 19: Add More Functions (Phase 2)
**Goal:** Add missing functions to code.ts

**Functions to add (copy EXACTLY as shown in original CLAUDE.md):**
- expandSectionGrow
- replaceWithInstance
- findSimilar
- repositionUI
- createArtTask
- etc.

**File:** `src/code.ts`

**INSERT each after existing functions, test compilation after each**

---

## VERIFICATION CHECKLIST

After completing all steps:

- [ ] `/src/` contains ONLY: code.ts, ui.html, types.d.ts
- [ ] manifest.json matches Figma format EXACTLY
- [ ] tsconfig.json targets ES2019
- [ ] `npm run build` produces NO errors
- [ ] dist/src/code.js exists and is > 50KB
- [ ] ui.html loads without console errors
- [ ] Plugin appears in Figma
- [ ] Buttons respond to clicks
- [ ] Message passing works (check console)
- [ ] Selection info updates (check console)

---

## IF STUCK

1. **Compilation error:** Show EXACT error message, fix ONLY that function
2. **Plugin won't load:** Check manifest.json format
3. **Buttons don't work:** Check message types EXACTLY match
4. **Selection doesn't update:** Check figma.on("selectionchange") is called

**DO NOT:**
- ❌ Skip steps
- ❌ Combine multiple steps
- ❌ Add features not in this guide
- ❌ Modify function signatures
- ❌ Use different API calls
- ❌ Leave old files in /src/
