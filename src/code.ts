// KISS Booster — Figma Plugin

const H_GAP = 80;
const V_GAP = 160;
const SECTION_PADDING = 100;

// ─── Helpers ─────────────────────────────────────────────────────

function sendStatus(text: string, status: "success" | "error" | "") {
  figma.ui.postMessage({ type: "status", text, status });
}

async function findDarkMode(): Promise<{ collection: VariableCollection; modeId: string } | null> {
  // 1. Try local collections
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    const darkMode = collection.modes.find(
      (m) => m.name.toLowerCase() === "dark"
    );
    if (darkMode) {
      return { collection, modeId: darkMode.modeId };
    }
  }

  // 2. Not found locally — scan bound variables in selection for library collections
  const checkedIds = new Set(collections.map((c) => c.id));
  const queue: SceneNode[] = [...figma.currentPage.selection];
  let checked = 0;

  while (queue.length > 0 && checked < 50) {
    const node = queue.shift()!;
    checked++;

    if ("boundVariables" in node) {
      const bv = node.boundVariables as Record<string, any> | undefined;
      if (bv) {
        for (const val of Object.values(bv)) {
          const bindings = Array.isArray(val) ? val : val ? [val] : [];
          for (const b of bindings) {
            if (!b?.id) continue;
            try {
              const v = await figma.variables.getVariableByIdAsync(b.id);
              if (!v || checkedIds.has(v.variableCollectionId)) continue;
              checkedIds.add(v.variableCollectionId);
              const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
              if (col) {
                const dark = col.modes.find((m) => m.name.toLowerCase() === "dark");
                if (dark) return { collection: col, modeId: dark.modeId };
              }
            } catch (_e) {}
          }
        }
      }
    }

    if ("children" in node) {
      for (const child of (node as ChildrenMixin & SceneNode).children) {
        queue.push(child as SceneNode);
      }
    }
  }

  return null;
}

async function findVariable(name: string): Promise<Variable | null> {
  // Get ALL local variables (no type filter)
  const allVars = await figma.variables.getLocalVariablesAsync();

  const search = (vars: Array<{ name: string }>) => {
    const exact = vars.find((v) => v.name === name);
    if (exact) return exact;
    const byEnd = vars.find((v) => v.name.endsWith("/" + name));
    if (byEnd) return byEnd;
    const partial = vars.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    return partial ?? null;
  };

  const found = search(allVars);
  if (found) return found as Variable;

  // Not found locally — search in library collections
  try {
    const libCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const libCol of libCollections) {
      const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCol.key);
      const match = search(libVars);
      if (match) {
        return await figma.variables.importVariableByKeyAsync((match as LibraryVariable).key);
      }
    }
    figma.notify(`⚠ "${name}" not found (${allVars.length} local, ${libCollections.length} libs)`, { timeout: 5000 });
  } catch (e) {
    figma.notify(`⚠ Library search error: ${e}`, { timeout: 5000 });
  }

  return null;
}

// ─── Feature 1: Dark Theme Copy ──────────────────────────────────

async function darkThemeCopy(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select frames", "error");
    return;
  }

  const dark = await findDarkMode();
  if (!dark) {
    sendStatus("Dark mode not found", "error");
    return;
  }

  // If a Section is selected, work inside it
  const sectionSelected = selection.find((n) => n.type === "SECTION") as SectionNode | undefined;

  let lightFrames: SceneNode[] = [];
  let container: ChildrenMixin | null = null;

  if (sectionSelected) {
    container = sectionSelected;
    // Find light frames inside the section (not dark copies)
    for (const child of sectionSelected.children) {
      if (!child.name.endsWith(" — Dark")) {
        lightFrames.push(child);
      }
    }
    // Remove existing dark copies (will be recreated)
    for (const child of [...sectionSelected.children]) {
      if (child.name.endsWith(" — Dark")) {
        child.remove();
      }
    }
  } else {
    // Regular selection — use selected frames directly
    lightFrames = selection.filter((n) => !n.name.endsWith(" — Dark"));
  }

  if (lightFrames.length === 0) {
    sendStatus("No light frames", "error");
    return;
  }

  const clones: SceneNode[] = [];

  for (const node of lightFrames) {
    if (!("clone" in node)) continue;
    const clone = (node as FrameNode).clone();

    clone.x = node.x;
    clone.y = node.y + node.height + V_GAP;
    clone.setExplicitVariableModeForCollection(dark.collection, dark.modeId);
    clone.name = node.name + " — Dark";

    // If inside a Section, append clone to the section
    if (container) {
      container.appendChild(clone);
      clone.x = node.x;
      clone.y = node.y + node.height + V_GAP;
    }

    clones.push(clone);
  }

  // Resize section to fit new content
  if (sectionSelected && clones.length > 0) {
    let maxY = 0;
    for (const child of sectionSelected.children) {
      const bottom = child.y + child.height;
      if (bottom > maxY) maxY = bottom;
    }
    sectionSelected.resizeWithoutConstraints(
      sectionSelected.width,
      maxY + SECTION_PADDING
    );
  }

  if (clones.length > 0) {
    figma.currentPage.selection = clones;
    const viewNodes = sectionSelected ? [sectionSelected] : [...lightFrames, ...clones];
    figma.viewport.scrollAndZoomIntoView(viewNodes);
  }

  sendStatus(`${clones.length} dark copies created`, "success");
}

// ─── Feature 2: Wrap to New Selection ────────────────────────────

async function wrapToNewSelection(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select frames", "error");
    return;
  }

  // Block if selection contains Sections
  if (selection.some((n) => n.type === "SECTION")) {
    sendStatus("Use Fix Selection for sections", "error");
    return;
  }

  // Block if all selected frames are dark copies
  const allDark = selection.every((n) => n.name.endsWith(" — Dark"));
  if (allDark) {
    sendStatus("Select light frames only", "error");
    return;
  }

  // --- Separate light originals from existing dark copies ---
  const allNames = new Set(selection.map((n) => n.name));
  const lightFrames: SceneNode[] = [];
  const existingDarkFrames: SceneNode[] = [];

  for (const node of selection) {
    if (node.name.endsWith(" — Dark") && allNames.has(node.name.replace(/ — Dark$/, ""))) {
      existingDarkFrames.push(node);
    } else {
      lightFrames.push(node);
    }
  }

  if (lightFrames.length === 0) {
    sendStatus("No light frames", "error");
    return;
  }

  // --- Step 1: Align light frames in a horizontal row ---
  lightFrames.sort((a, b) => a.x - b.x);

  let baseY = Infinity;
  for (const f of lightFrames) {
    if (f.y < baseY) baseY = f.y;
  }
  const baseX = lightFrames[0].x;

  let nextX = baseX;
  for (const frame of lightFrames) {
    frame.x = nextX;
    frame.y = baseY;
    nextX = nextX + frame.width + H_GAP;
  }

  // --- Step 2: Try dark theme (skip if not available) ---
  const dark = await findDarkMode();
  let allDarkFrames: SceneNode[] = [];

  if (dark) {
    // Re-position existing dark copies
    const existingDarkByLightName = new Map<string, SceneNode>();
    for (const df of existingDarkFrames) {
      const lightName = df.name.replace(/ — Dark$/, "");
      existingDarkByLightName.set(lightName, df);
    }

    for (const lightFrame of lightFrames) {
      const darkFrame = existingDarkByLightName.get(lightFrame.name);
      if (darkFrame) {
        darkFrame.x = lightFrame.x;
        darkFrame.y = lightFrame.y + lightFrame.height + V_GAP;
      }
    }

    // Create missing dark copies
    const newDarkFrames: SceneNode[] = [];
    for (const frame of lightFrames) {
      if (existingDarkByLightName.has(frame.name)) continue;
      if (!("clone" in frame)) continue;

      const clone = (frame as FrameNode).clone();
      clone.x = frame.x;
      clone.y = frame.y + frame.height + V_GAP;
      clone.setExplicitVariableModeForCollection(dark.collection, dark.modeId);
      clone.name = frame.name + " — Dark";
      newDarkFrames.push(clone);
    }

    allDarkFrames = [...existingDarkFrames, ...newDarkFrames];
  }

  const allFrames = [...lightFrames, ...allDarkFrames];

  // --- Step 4: Calculate bounding box of all frames (absolute coords) ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of allFrames) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;

  // --- Step 5: Create Section and move frames inside ---
  const section = figma.createSection();
  section.name = "Section";
  section.x = minX - SECTION_PADDING;
  section.y = minY - SECTION_PADDING;
  section.resizeWithoutConstraints(
    contentW + SECTION_PADDING * 2,
    contentH + SECTION_PADDING * 2
  );

  // Apply fill token
  const fillVar = await findVariable("default_system_frame");
  if (fillVar) {
    try {
      const baseFill: SolidPaint = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
      const boundFill = figma.variables.setBoundVariableForPaint(baseFill, "color", fillVar);
      section.fills = [boundFill];
    } catch (_e) {
      figma.notify("⚠ Could not bind fill variable to section", { timeout: 3000 });
    }
  } else {
    figma.notify("⚠ Variable \"default_system_frame\" not found", { timeout: 3000 });
  }

  // Move all frames into the section
  for (const node of allFrames) {
    const oldX = node.x;
    const oldY = node.y;
    section.appendChild(node);
    node.x = oldX - minX + SECTION_PADDING;
    node.y = oldY - minY + SECTION_PADDING;
  }

  figma.currentPage.selection = [section];
  figma.viewport.scrollAndZoomIntoView([section]);

  const darkMsg = allDarkFrames.length > 0 ? ` + ${allDarkFrames.length} dark` : "";
  sendStatus(`Wrapped ${lightFrames.length}${darkMsg}`, "success");
}

// ─── Feature 3: Calculate Size ───────────────────────────────────

function findTextNodes(node: SceneNode): TextNode[] {
  const texts: TextNode[] = [];
  if (node.type === "TEXT") {
    texts.push(node);
  }
  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      texts.push(...findTextNodes(child as SceneNode));
    }
  }
  return texts;
}

function findIconTags(node: SceneNode): SceneNode[] {
  const tags: SceneNode[] = [];
  if (node.name === "IconTag") {
    tags.push(node);
  }
  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      tags.push(...findIconTags(child as SceneNode));
    }
  }
  return tags;
}

async function calculateSize(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length !== 2) {
    sendStatus("Select ArtTask + object", "error");
    return;
  }

  // Figure out which is the ArtTask and which is the target
  let artTask: SceneNode | null = null;
  let target: SceneNode | null = null;

  for (const node of selection) {
    const iconTags = findIconTags(node);
    if (iconTags.length >= 2) {
      artTask = node;
    } else {
      target = node;
    }
  }

  if (!artTask || !target) {
    sendStatus("Can't find ArtTask + target", "error");
    return;
  }

  const w = Math.round(target.width);
  const h = Math.round(target.height);
  const sizeText = `${w}x${h}px`;

  // Art size groups (sorted smallest to largest)
  const ART_GROUPS: [number, number][] = [
    [160, 160],
    [320, 320],
    [540, 800],
  ];

  // Find smallest group that contains the object
  let group = ART_GROUPS[ART_GROUPS.length - 1];
  for (const g of ART_GROUPS) {
    if (w <= g[0] && h <= g[1]) {
      group = g;
      break;
    }
  }

  // Round up to nearest even integer
  const ceilEven = (n: number) => Math.ceil(n / 2) * 2;

  // Scale proportionally to fit the group, round up to even
  const scale = Math.min(group[0] / w, group[1] / h);
  const artW = ceilEven(w * scale);
  const artH = ceilEven(h * scale);

  // Multiply by 3 (even × 3 = always even, always integer)
  const retW = artW * 3;
  const retH = artH * 3;
  const size3xText = `${retW}x${retH}px`;

  // Find the IconTag instances inside ArtTask
  const iconTags = findIconTags(artTask);

  // IconTag order: [0] = plain text, [1] = semi-transparent bg, [2] = opaque bg
  if (iconTags.length < 3) {
    sendStatus("Not enough IconTags", "error");
    return;
  }

  const tag1Texts = findTextNodes(iconTags[1]);
  const tag2Texts = findTextNodes(iconTags[2]);

  if (tag1Texts.length === 0 || tag2Texts.length === 0) {
    sendStatus("No text in IconTags", "error");
    return;
  }

  // Load fonts and set text
  for (const textNode of [...tag1Texts, ...tag2Texts]) {
    const fontName = textNode.fontName;
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
  }

  tag1Texts[0].characters = sizeText;
  tag2Texts[tag2Texts.length - 1].characters = size3xText;

  sendStatus(`${sizeText} → x3 → ${size3xText}`, "success");
}

// ─── Feature 4: Align Sections ───────────────────────────────────

const SECTION_GAP = 400;

async function alignSections(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  // Use selected sections, or all sections on page
  let sections: SectionNode[] = [];

  if (selection.length > 0) {
    sections = selection.filter((n) => n.type === "SECTION") as SectionNode[];
  }

  if (sections.length === 0) {
    // Find all sections on the current page
    for (const child of figma.currentPage.children) {
      if (child.type === "SECTION") {
        sections.push(child);
      }
    }
  }

  if (sections.length === 0) {
    sendStatus("No sections found", "error");
    return;
  }

  const COLS = 6;

  // Use last selected section as anchor
  const lastSelected = selection.length > 0
    ? selection[selection.length - 1] as SectionNode
    : null;
  const baseX = lastSelected ? lastSelected.x : sections[0].x;
  const baseY = lastSelected ? lastSelected.y : sections[0].y;

  // Sort by current x position to preserve order
  sections.sort((a, b) => a.x - b.x);

  // Find tallest section for vertical gap
  let maxHeight = 0;
  for (const s of sections) {
    if (s.height > maxHeight) maxHeight = s.height;
  }
  const vGap = maxHeight + SECTION_GAP;

  let nextX = baseX;
  let rowY = baseY;

  for (let i = 0; i < sections.length; i++) {
    if (i > 0 && i % COLS === 0) {
      // New row
      nextX = baseX;
      rowY += vGap;
    }
    sections[i].x = nextX;
    sections[i].y = rowY;
    nextX += sections[i].width + SECTION_GAP;
  }

  figma.currentPage.selection = sections;
  figma.viewport.scrollAndZoomIntoView(sections);
  sendStatus(`${sections.length} sections aligned`, "success");
}

// ─── Feature: Toggle Ready for Dev ──────────────────────────────

async function toggleDevStatus(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  let targets: SceneNode[] = [];

  if (selection.length > 0) {
    // Use selected nodes that support devStatus
    targets = selection.filter((n) => "devStatus" in n);
  } else {
    // No selection — collect all top-level frames/sections on the page
    for (const child of figma.currentPage.children) {
      if ("devStatus" in child) targets.push(child);
    }
  }

  if (targets.length === 0) return;

  // Determine direction: if ANY target is not ready → set all to ready, otherwise clear all
  const allReady = targets.every(
    (n) => (n as FrameNode).devStatus?.type === "READY_FOR_DEV"
  );

  for (const node of targets) {
    (node as FrameNode).devStatus = allReady
      ? null
      : { type: "READY_FOR_DEV" };
  }
}

// ─── Feature: Smart Copy ────────────────────────────────────────

async function smartCopy(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select a frame", "error");
    return;
  }

  const node = selection[0];
  if (!("clone" in node)) {
    sendStatus("Can't clone this node", "error");
    return;
  }

  const clone = (node as FrameNode).clone();
  clone.x = node.x + node.width + H_GAP;
  clone.y = node.y;

  // If inside a section, expand section and cascade-shift neighbors
  const parentSection = node.parent;
  if (parentSection && parentSection.type === "SECTION") {
    parentSection.appendChild(clone);
    clone.x = node.x + node.width + H_GAP;
    clone.y = node.y;

    // Expand section to fit the new clone
    let maxX = 0;
    for (const child of parentSection.children) {
      const right = child.x + child.width;
      if (right > maxX) maxX = right;
    }
    const newWidth = maxX + SECTION_PADDING;
    const expandAmount = newWidth - parentSection.width;

    if (expandAmount > 0) {
      parentSection.resizeWithoutConstraints(newWidth, parentSection.height);

      // Cascade-shift sections to the right
      const allPageSections: SectionNode[] = [];
      for (const child of figma.currentPage.children) {
        if (child.type === "SECTION") allPageSections.push(child);
      }

      const rightSections = allPageSections
        .filter((s) => s !== parentSection && s.x >= parentSection.x)
        .sort((a, b) => a.x - b.x);

      let prevRight = parentSection.x + parentSection.width;
      for (const other of rightSections) {
        const gap = other.x - prevRight;
        if (gap >= SECTION_GAP) break;
        other.x = prevRight + SECTION_GAP;
        prevRight = other.x + other.width;
      }
    }
  }

  figma.currentPage.selection = [clone];
  figma.viewport.scrollAndZoomIntoView([clone]);
}

// ─── Feature 5: Expand Section ───────────────────────────────────

const MIN_GAP = 80;

async function expandSection(): Promise<void> {
  const selection = [...figma.currentPage.selection];
  const sections = selection.filter((n) => n.type === "SECTION") as SectionNode[];

  if (sections.length === 0) {
    sendStatus("Select a section", "error");
    return;
  }

  // Collect all sections on the page to shift neighbors
  const allPageSections: SectionNode[] = [];
  for (const child of figma.currentPage.children) {
    if (child.type === "SECTION") allPageSections.push(child);
  }

  for (const section of sections) {
    // Get top-row children (light frames, skip sections and dark copies)
    const children: SceneNode[] = [];
    for (const child of section.children) {
      if (child.type === "SECTION") continue;
      if (child.name.endsWith(" — Dark")) continue;
      children.push(child);
    }

    let expandAmount: number;

    if (children.length === 0) {
      expandAmount = MIN_GAP + 540;
    } else {
      // Sort by x to find gaps and last object
      children.sort((a, b) => a.x - b.x);

      // Calculate gaps between consecutive objects
      const gaps: number[] = [];
      for (let i = 1; i < children.length; i++) {
        const prevRight = children[i - 1].x + children[i - 1].width;
        const gap = children[i].x - prevRight;
        if (gap > 0) gaps.push(gap);
      }

      const gapSize = gaps.length > 0 ? gaps[0] : MIN_GAP;
      const lastWidth = children[children.length - 1].width;
      expandAmount = gapSize + lastWidth;
    }

    section.resizeWithoutConstraints(section.width + expandAmount, section.height);

    // Cascade-shift sections to the right if gap < SECTION_GAP
    const rightSections = allPageSections
      .filter((s) => s !== section && s.x >= section.x)
      .sort((a, b) => a.x - b.x);

    let prevRight = section.x + section.width;
    for (const other of rightSections) {
      const gap = other.x - prevRight;
      if (gap >= SECTION_GAP) break;
      other.x = prevRight + SECTION_GAP;
      prevRight = other.x + other.width;
    }
  }

  // No status — expand is instant, no Done delay
}

// ─── Feature 6: Fix Selection ────────────────────────────────────

async function fixSelection(): Promise<void> {
  const selection = [...figma.currentPage.selection];
  const section = selection.find((n) => n.type === "SECTION") as SectionNode | undefined;

  if (!section) {
    sendStatus("Select a section", "error");
    return;
  }

  const dark = await findDarkMode();

  // Collect light frames (skip sections and dark copies)
  const lightFrames: SceneNode[] = [];
  for (const child of section.children) {
    if (child.type === "SECTION") continue;
    if (child.name.endsWith(" — Dark")) continue;
    lightFrames.push(child);
  }

  if (lightFrames.length === 0) {
    sendStatus("No light frames", "error");
    return;
  }

  // Remove all existing dark copies
  for (const child of [...section.children]) {
    if (child.name.endsWith(" — Dark")) {
      child.remove();
    }
  }

  // Align light frames horizontally inside section
  lightFrames.sort((a, b) => a.x - b.x);
  let nextX = SECTION_PADDING;
  for (const frame of lightFrames) {
    frame.x = nextX;
    frame.y = SECTION_PADDING;
    nextX = nextX + frame.width + H_GAP;
  }

  // Create dark copies if dark mode is available
  const clones: SceneNode[] = [];
  if (dark) {
    for (const frame of lightFrames) {
      if (!("clone" in frame)) continue;
      const clone = (frame as FrameNode).clone();
      section.appendChild(clone);
      clone.x = frame.x;
      clone.y = frame.y + frame.height + V_GAP;
      clone.setExplicitVariableModeForCollection(dark.collection, dark.modeId);
      clone.name = frame.name + " — Dark";
      clones.push(clone);
    }
  }

  // Resize section to fit content
  let maxX = 0, maxY = 0;
  for (const child of section.children) {
    if (child.type === "SECTION") continue;
    const right = child.x + child.width;
    const bottom = child.y + child.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  section.resizeWithoutConstraints(
    maxX + SECTION_PADDING,
    maxY + SECTION_PADDING
  );

  figma.currentPage.selection = [section];
  figma.viewport.scrollAndZoomIntoView([section]);
  const darkMsg = clones.length > 0 ? ` + ${clones.length} dark` : "";
  sendStatus(`Fixed ${lightFrames.length}${darkMsg}`, "success");
}

// ─── Feature 7: Create Art Block ─────────────────────────────────

const ART_BLOCK_GAP = 240;

let cachedArtTask: ComponentNode | null = null;

async function findArtTaskComponent(): Promise<ComponentNode | null> {
  if (cachedArtTask && !cachedArtTask.removed) return cachedArtTask;

  // Try saved key first — instant import
  const savedKey = await figma.clientStorage.getAsync("artTaskKey");
  if (savedKey) {
    try {
      cachedArtTask = await figma.importComponentByKeyAsync(savedKey);
      return cachedArtTask;
    } catch (_e) {
      await figma.clientStorage.deleteAsync("artTaskKey");
    }
  }

  // Fallback: search current page
  const candidates = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "INSTANCE"] });
  for (const node of candidates) {
    const name = node.name.toLowerCase().replace(/\s+/g, "");
    if (!name.includes("arttask")) continue;
    if (node.type === "COMPONENT") {
      cachedArtTask = node;
      await figma.clientStorage.setAsync("artTaskKey", node.key);
      return node;
    }
    if (node.type === "INSTANCE") {
      const main = (node as InstanceNode).mainComponent;
      if (main) {
        cachedArtTask = main;
        await figma.clientStorage.setAsync("artTaskKey", main.key);
        return main;
      }
    }
  }
  return null;
}

async function fillArtTask(node: SceneNode, sizeText: string, size3xText: string): Promise<void> {
  const iconTags = findIconTags(node);
  if (iconTags.length < 3) return;

  const tag1Texts = findTextNodes(iconTags[1]);
  const tag2Texts = findTextNodes(iconTags[2]);
  const allTexts = [...tag1Texts, ...tag2Texts];

  for (const textNode of allTexts) {
    const fontName = textNode.fontName;
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
  }

  if (tag1Texts.length > 0) tag1Texts[0].characters = sizeText;
  if (tag2Texts.length > 0) tag2Texts[tag2Texts.length - 1].characters = size3xText;
}

async function createArtBlock(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length !== 2) {
    sendStatus("Select 1 object + 1 ArtTask", "error");
    return;
  }

  // Separate ArtTask from target
  let artTask: SceneNode | null = null;
  let target: SceneNode | null = null;

  for (const node of selection) {
    const iconTags = findIconTags(node);
    if (iconTags.length >= 2) {
      artTask = node;
    } else {
      target = node;
    }
  }

  if (!artTask || !target) {
    sendStatus("Select 1 object + 1 ArtTask", "error");
    return;
  }

  // Calculate sizes
  const w = Math.round(target.width);
  const h = Math.round(target.height);
  const sizeText = `${w}x${h}px`;

  const ART_GROUPS: [number, number][] = [
    [160, 160],
    [320, 320],
    [540, 800],
  ];
  const ceilEven = (n: number) => Math.ceil(n / 2) * 2;

  let group = ART_GROUPS[ART_GROUPS.length - 1];
  for (const g of ART_GROUPS) {
    if (w <= g[0] && h <= g[1]) { group = g; break; }
  }
  const scale = Math.min(group[0] / w, group[1] / h);
  const artW = ceilEven(w * scale);
  const artH = ceilEven(h * scale);
  const size3xText = `${artW * 3}x${artH * 3}px`;

  // Fill ArtTask with size data
  await fillArtTask(artTask, sizeText, size3xText);

  // Create green elbow arrow from ArtTask to target
  const artBB = artTask.absoluteBoundingBox;
  const targetBB = target.absoluteBoundingBox;
  if (artBB && targetBB) {
    const arrow = figma.createVector();
    arrow.name = "ArtTask Arrow";

    const targetCenterY = targetBB.y + targetBB.height / 2;
    const gap = 20;
    const goingDown = targetCenterY > artBB.y + artBB.height / 2;

    // Start from bottom or top edge of ArtTask (center X), outside the block
    const startX = artBB.x + artBB.width / 2;
    const startY = goingDown
      ? artBB.y + artBB.height + gap
      : artBB.y - gap;

    // End at target edge closest to ArtTask, with gap
    const artCenterX = artBB.x + artBB.width / 2;
    const targetCenterX = targetBB.x + targetBB.width / 2;
    const endX = artCenterX < targetCenterX
      ? targetBB.x - gap
      : targetBB.x + targetBB.width + gap;
    const endY = targetCenterY;

    // All points for bounding box
    const allX = [startX, endX];
    const allY = [startY, endY];
    const minX = Math.min(...allX);
    const minY = Math.min(...allY);
    const maxX = Math.max(...allX);
    const maxY = Math.max(...allY);

    arrow.x = minX;
    arrow.y = minY;
    arrow.resize(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1));

    // Local coordinates
    const lsx = startX - minX, lsy = startY - minY;
    const lex = endX - minX, ley = endY - minY;

    // #30CB44
    const green = { r: 48 / 255, g: 203 / 255, b: 68 / 255 };

    // Elbow: vertical from ArtTask edge → horizontal to target (1 corner)
    arrow.vectorNetwork = {
      vertices: [
        { x: lsx, y: lsy, strokeCap: "NONE", cornerRadius: 0 },
        { x: lsx, y: ley, strokeCap: "NONE", cornerRadius: 16 },
        { x: lex, y: ley, strokeCap: "ARROW_EQUILATERAL", cornerRadius: 0 },
      ],
      segments: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
      ],
      regions: [],
    };

    arrow.strokes = [{ type: "SOLID", color: green }];
    arrow.strokeWeight = 4;
    arrow.fills = [];
  }

  figma.currentPage.selection = [artTask];
  sendStatus(`${sizeText} → x3 → ${size3xText}`, "success");
}

// ─── Feature 8: Frame with Border ────────────────────────────────

async function frameWithBorder(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select objects", "error");
    return;
  }

  const wrappers: SceneNode[] = [];

  for (const node of selection) {
    const parent = node.parent;
    if (!parent || !("appendChild" in parent)) continue;

    const bb = node.absoluteBoundingBox;
    if (!bb) continue;

    // Node's transform origin (absolute)
    const originAbsX = node.absoluteTransform[0][2];
    const originAbsY = node.absoluteTransform[1][2];

    // Parent's absolute position
    const parentAbsX = "absoluteTransform" in parent ? (parent as SceneNode).absoluteTransform[0][2] : 0;
    const parentAbsY = "absoluteTransform" in parent ? (parent as SceneNode).absoluteTransform[1][2] : 0;

    const wrapper = figma.createFrame();
    wrapper.name = node.name;
    wrapper.resize(bb.width + 2, bb.height + 2);
    // Position wrapper so it covers bounding box + 1px padding
    wrapper.x = bb.x - 1 - parentAbsX;
    wrapper.y = bb.y - 1 - parentAbsY;
    wrapper.clipsContent = false;
    wrapper.fills = [];
    wrapper.strokes = [];

    // Insert wrapper where node is, then move node inside
    const idx = (parent as ChildrenMixin).children.indexOf(node as SceneNode);
    (parent as ChildrenMixin).insertChild(idx, wrapper);
    wrapper.appendChild(node);

    // Position node's origin relative to wrapper
    node.x = originAbsX - (bb.x - 1);
    node.y = originAbsY - (bb.y - 1);

    wrappers.push(wrapper);
  }

  figma.currentPage.selection = wrappers;
  sendStatus(`${wrappers.length} framed`, "success");
}

// ─── UI Setup ────────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 420, themeColors: true });

// ─── Translator helpers ──────────────────────────────────────────

function findAllTextNodes(nodes: ReadonlyArray<SceneNode>): TextNode[] {
  let result: TextNode[] = [];
  for (const node of nodes) {
    if (node.type === "TEXT") {
      result.push(node);
    } else if ("children" in node) {
      result = result.concat(findAllTextNodes((node as ChildrenMixin & SceneNode).children as SceneNode[]));
    }
  }
  return result;
}

function sendSelectionInfo() {
  const sel = figma.currentPage.selection;
  const count = sel.length;
  const hasSection = sel.some((n) => n.type === "SECTION");
  const hasFrames = sel.some((n) => n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE");
  const allDark = count > 0 && sel.every((n) => n.name.endsWith(" — Dark"));
  const hasAny = count > 0;
  const textCount = findAllTextNodes(sel).length;

  figma.ui.postMessage({
    type: "selection-info",
    count,
    hasSection,
    hasFrames,
    allDark,
    hasAny,
    textCount,
  });
}

figma.on("selectionchange", sendSelectionInfo);
sendSelectionInfo();

figma.ui.onmessage = async (msg: { type: string }) => {
  switch (msg.type) {
    case "dark-theme-copy":
      await darkThemeCopy();
      break;
    case "wrap-selection":
      await wrapToNewSelection();
      break;
    case "calc-size":
      await calculateSize();
      break;
    case "align-sections":
      await alignSections();
      break;
    case "expand-section":
      await expandSection();
      break;
    case "smart-copy":
      await smartCopy();
      break;
    case "toggle-dev-status":
      await toggleDevStatus();
      break;
    case "fix-selection":
      await fixSelection();
      break;
    case "create-art-block":
      await createArtBlock();
      break;
    case "frame-border":
      await frameWithBorder();
      break;
    case "request-selection":
      sendSelectionInfo();
      break;
    case "resize":
      figma.ui.resize(320, (msg as any).height);
      break;
    case "run-translation": {
      const textNodes = findAllTextNodes(figma.currentPage.selection);
      if (textNodes.length === 0) {
        sendStatus("No text layers", "error");
        break;
      }
      const payload = textNodes.map((n) => ({ id: n.id, text: n.characters }));
      figma.ui.postMessage({
        type: "start-api-call",
        payload,
        target: (msg as any).target,
      });
      break;
    }
    case "apply-data": {
      try {
        const results = (msg as any).results as Array<{ id: string; translatedText: string }>;
        for (const item of results) {
          const node = await figma.getNodeByIdAsync(item.id);
          if (node && node.type === "TEXT") {
            const textNode = node as TextNode;
            let fontToLoad = textNode.fontName;
            if (fontToLoad === figma.mixed) {
              fontToLoad = textNode.getRangeFontName(0, 1) as FontName;
              await figma.loadFontAsync(fontToLoad);
              textNode.setRangeFontName(0, textNode.characters.length, fontToLoad);
            } else {
              await figma.loadFontAsync(fontToLoad);
            }
            textNode.characters = item.translatedText;
          }
        }
        figma.ui.postMessage({ type: "apply-data-success" });
        sendStatus(`${results.length} texts translated`, "success");
      } catch (_e) {
        figma.ui.postMessage({ type: "translate-error" });
        sendStatus("Translation apply error", "error");
      }
      break;
    }
  }
};
