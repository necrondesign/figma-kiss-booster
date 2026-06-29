// KISS Booster — Figma Plugin

const H_GAP = 80;
const V_GAP = 160;
const SECTION_PADDING = 100;

// ─── Helpers ─────────────────────────────────────────────────────

function sendStatus(text: string, status: "success" | "error" | "") {
  figma.ui.postMessage({ type: "status", text, status });
  if (text) figma.notify(text, status === "error" ? { error: true } : undefined);
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

type Orientation = "horizontal" | "vertical";

// Detect whether frames are laid out as a row or a column from their current positions
function detectOrientation(frames: ReadonlyArray<SceneNode>): Orientation {
  if (frames.length < 2) return "horizontal";
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of frames) {
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  return (maxY - minY) > (maxX - minX) ? "vertical" : "horizontal";
}

// Place a dark copy next to its light frame: below if row, to the right if column
function placeDarkCopy(dark: SceneNode, light: SceneNode, orientation: Orientation): void {
  if (orientation === "horizontal") {
    dark.x = light.x;
    dark.y = light.y + light.height + V_GAP;
  } else {
    dark.x = light.x + light.width + H_GAP;
    dark.y = light.y;
  }
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

async function wrapToNewSelection(withDark: boolean = true): Promise<void> {
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

  // --- Step 1: Align light frames, keeping their existing orientation ---
  const orientation = detectOrientation(lightFrames);

  let baseX = Infinity, baseY = Infinity;
  for (const f of lightFrames) {
    if (f.x < baseX) baseX = f.x;
    if (f.y < baseY) baseY = f.y;
  }

  if (orientation === "horizontal") {
    lightFrames.sort((a, b) => a.x - b.x);
    let nextX = baseX;
    for (const frame of lightFrames) {
      frame.x = nextX;
      frame.y = baseY;
      nextX = nextX + frame.width + H_GAP;
    }
  } else {
    lightFrames.sort((a, b) => a.y - b.y);
    let nextY = baseY;
    for (const frame of lightFrames) {
      frame.x = baseX;
      frame.y = nextY;
      nextY = nextY + frame.height + V_GAP;
    }
  }

  // --- Step 2: Try dark theme (skip if not available or not requested) ---
  const dark = withDark ? await findDarkMode() : null;
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
        placeDarkCopy(darkFrame, lightFrame, orientation);
      }
    }

    // Create missing dark copies
    const newDarkFrames: SceneNode[] = [];
    for (const frame of lightFrames) {
      if (existingDarkByLightName.has(frame.name)) continue;
      if (!("clone" in frame)) continue;

      const clone = (frame as FrameNode).clone();
      placeDarkCopy(clone, frame, orientation);
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

  const usedSelection = sections.length > 0;

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

  // Sort by current x position to preserve order
  sections.sort((a, b) => a.x - b.x);

  // Selection → start from the leftmost selected section; nothing selected → from (0, 0)
  const baseX = usedSelection ? sections[0].x : 0;
  const baseY = usedSelection ? sections[0].y : 0;

  let nextX = baseX;
  for (let i = 0; i < sections.length; i++) {
    sections[i].x = nextX;
    sections[i].y = baseY;
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
  const shiftAmount = node.width + H_GAP;
  clone.x = node.x + shiftAmount;
  clone.y = node.y;

  // If inside a section, shift siblings to the right and expand
  const parentSection = node.parent;
  if (parentSection && parentSection.type === "SECTION") {
    // Shift all siblings to the right of the insert point
    const insertRight = node.x + node.width;
    for (const child of parentSection.children) {
      if (child === node) continue;
      if (child.x >= insertRight) {
        child.x += shiftAmount;
      }
    }

    parentSection.appendChild(clone);
    clone.x = node.x + node.width + H_GAP;
    clone.y = node.y;

    // Expand section to fit
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

// ─── Feature 5: Expand Section (ported, row-aware, both directions) ──

const SECTION_EXPAND_BARE = 620; // empty expand for a bare section (540 + 80)

const FRAMEISH = new Set(["FRAME", "COMPONENT", "INSTANCE"]);

// Shift sections that sit on the same row and to the right of `fromX`
function shiftRowSectionsRight(section: SectionNode, fromX: number, by: number): void {
  for (const s of figma.currentPage.children) {
    if (s.type !== "SECTION" || s.id === section.id) continue;
    const sec = s as SectionNode;
    if (
      sec.x >= fromX &&
      sec.y < section.y + section.height &&
      sec.y + sec.height > section.y
    ) {
      sec.x += by;
    }
  }
}

async function expandSectionGrow(direction: "left" | "right", duplicate: boolean = true): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length !== 1) {
    sendStatus("Select 1 section or frame", "error");
    return;
  }

  const node = selection[0];

  // Frame inside a section → duplicate and shift neighbors
  if (FRAMEISH.has(node.type)) {
    const frame = node as FrameNode;
    const parent = frame.parent;

    // Standalone frame (not in a section) → simple copy to the side
    if (!parent || parent.type !== "SECTION") {
      if (!parent || !("appendChild" in parent) || !("clone" in frame)) {
        sendStatus("Can't copy this", "error");
        return;
      }
      const clone = frame.clone();
      clone.y = frame.y;
      clone.x = direction === "right"
        ? frame.x + frame.width + H_GAP
        : frame.x - frame.width - H_GAP;
      (parent as ChildrenMixin).appendChild(clone);
      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);
      return;
    }

    const section = parent as SectionNode;
    const expandBy = frame.width + H_GAP;
    const originalRight = section.x + section.width;
    const originalFrameX = frame.x;
    const originalFrameY = frame.y;

    section.resizeWithoutConstraints(section.width + expandBy, section.height);

    for (const c of section.children) {
      if (!FRAMEISH.has(c.type)) continue;
      if (direction === "right") {
        if (c.id !== frame.id && c.x > originalFrameX) c.x += expandBy;
      } else {
        if (c.x >= originalFrameX) c.x += expandBy; // includes the frame itself
      }
    }

    if (duplicate) {
      const clone = frame.clone();
      clone.x = direction === "right" ? originalFrameX + frame.width + H_GAP : originalFrameX;
      clone.y = originalFrameY;
      section.appendChild(clone);
      figma.currentPage.selection = [clone];
    } else {
      figma.currentPage.selection = [section];
    }

    shiftRowSectionsRight(section, originalRight, expandBy);
    return;
  }

  // Bare section → grow by a fixed amount
  if (node.type !== "SECTION") {
    sendStatus("Select 1 section or frame", "error");
    return;
  }

  const section = node as SectionNode;
  const originalRight = section.x + section.width;

  section.resizeWithoutConstraints(section.width + SECTION_EXPAND_BARE, section.height);

  if (direction === "left") {
    for (const child of section.children) child.x += SECTION_EXPAND_BARE;
  }

  shiftRowSectionsRight(section, originalRight, SECTION_EXPAND_BARE);
}

// ─── Feature: Replace with Instance (ported) ─────────────────────

async function replaceWithInstance(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length < 2) {
    sendStatus("Select objects + reference last", "error");
    return;
  }

  // Reference = last node added to selection, fallback to last in array
  const source =
    (lastAddedId && selection.find((n) => n.id === lastAddedId)) ||
    selection[selection.length - 1];

  if (!("clone" in source)) {
    sendStatus("Reference can't be cloned", "error");
    return;
  }

  const targets = selection.filter((n) => n.id !== source.id);
  let count = 0;

  for (const target of targets) {
    const parent = target.parent;
    if (!parent || !("insertChild" in parent)) continue;

    const x = target.x;
    const y = target.y;
    const w = target.width;
    const h = target.height;
    const constraints = "constraints" in target ? (target as FrameNode).constraints : null;
    const index = (parent as ChildrenMixin).children.indexOf(target as SceneNode);

    const clone = (source as FrameNode).clone();
    (parent as ChildrenMixin).insertChild(index, clone);
    clone.x = x;
    clone.y = y;
    if ("resize" in clone) {
      try {
        clone.resize(w, h);
      } catch (_e) {}
    }
    if (constraints && "constraints" in clone) clone.constraints = constraints;

    target.remove();
    count++;
  }

  sendStatus(`Replaced ${count}`, "success");
}

// ─── Feature: Find Similar (ported) ──────────────────────────────

async function findSimilar(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length !== 1) {
    sendStatus("Select 1 object", "error");
    return;
  }

  const target = selection[0];
  const name = target.name;
  const w = Math.round(target.width);
  const h = Math.round(target.height);

  const candidates = figma.currentPage.findAllWithCriteria({ types: [target.type] } as any) as SceneNode[];
  const matches = candidates.filter(
    (n) => n.name === name && Math.round(n.width) === w && Math.round(n.height) === h
  );

  if (matches.length <= 1) {
    sendStatus("No similar found", "error");
    return;
  }

  figma.currentPage.selection = matches;
  figma.viewport.scrollAndZoomIntoView(matches);
  sendStatus(`Found ${matches.length} similar`, "success");
}

// ─── Feature 6: Fix Selection ────────────────────────────────────

async function fixSelection(withDark: boolean = true): Promise<void> {
  const selection = [...figma.currentPage.selection];
  const section = selection.find((n) => n.type === "SECTION") as SectionNode | undefined;

  if (!section) {
    sendStatus("Select a section", "error");
    return;
  }

  const dark = withDark ? await findDarkMode() : null;

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

  // Align light frames inside section, keeping their existing orientation
  const orientation = detectOrientation(lightFrames);
  if (orientation === "horizontal") {
    lightFrames.sort((a, b) => a.x - b.x);
    let nextX = SECTION_PADDING;
    for (const frame of lightFrames) {
      frame.x = nextX;
      frame.y = SECTION_PADDING;
      nextX = nextX + frame.width + H_GAP;
    }
  } else {
    lightFrames.sort((a, b) => a.y - b.y);
    let nextY = SECTION_PADDING;
    for (const frame of lightFrames) {
      frame.x = SECTION_PADDING;
      frame.y = nextY;
      nextY = nextY + frame.height + V_GAP;
    }
  }

  // Create dark copies if dark mode is available
  const clones: SceneNode[] = [];
  if (dark) {
    for (const frame of lightFrames) {
      if (!("clone" in frame)) continue;
      const clone = (frame as FrameNode).clone();
      section.appendChild(clone);
      placeDarkCopy(clone, frame, orientation);
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

// ─── Feature 9: Wrap in 540px Auto Layout ────────────────────────

const FRAME_FIXED_WIDTH = 540;

async function frame540(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select objects", "error");
    return;
  }

  const wrappers: SceneNode[] = [];

  for (const node of selection) {
    const parent = node.parent;
    if (!parent || !("appendChild" in parent)) continue;

    const nodeX = node.x;
    const nodeY = node.y;
    const childH = node.height;

    // Fixed width 540, height rounded up to the 8px grid
    const targetH = Math.ceil(childH / 8) * 8;

    // Auto-layout frame, centered, padding 0
    const wrapper = figma.createFrame();
    wrapper.name = node.name;
    wrapper.layoutMode = "VERTICAL";
    wrapper.paddingTop = 0;
    wrapper.paddingBottom = 0;
    wrapper.paddingLeft = 16;
    wrapper.paddingRight = 16;
    wrapper.itemSpacing = 0;
    wrapper.primaryAxisAlignItems = "CENTER";
    wrapper.counterAxisAlignItems = "CENTER";
    wrapper.clipsContent = false;
    wrapper.fills = [];
    wrapper.strokes = [];

    // Insert wrapper where node is, then move node inside
    const idx = (parent as ChildrenMixin).children.indexOf(node as SceneNode);
    (parent as ChildrenMixin).insertChild(idx, wrapper);
    wrapper.appendChild(node);

    // Stretch object to fill width (minus side padding); keep its own height
    if ("layoutAlign" in node) (node as SceneNode & { layoutAlign: string }).layoutAlign = "STRETCH";
    if ("layoutGrow" in node) (node as SceneNode & { layoutGrow: number }).layoutGrow = 0;

    // Fixed width 540 and fixed height on the 8px grid
    wrapper.counterAxisSizingMode = "FIXED";
    wrapper.primaryAxisSizingMode = "FIXED";
    wrapper.resizeWithoutConstraints(FRAME_FIXED_WIDTH, targetH);
    wrapper.x = nodeX;
    wrapper.y = nodeY;

    wrappers.push(wrapper);
  }

  figma.currentPage.selection = wrappers;
  sendStatus(`${wrappers.length} framed 540px`, "success");
}

// ─── Ported from colleague's plugin (kiss-figma-plugin) ──────────

// ⭐ Custom — pull layers out of auto-layout (absolute) and raise to top
async function customIgnoreAutoLayout(): Promise<void> {
  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) { sendStatus("Select layers", "error"); return; }
  let count = 0;
  for (const node of selection) {
    const parent = node.parent;
    if (!parent || !("insertChild" in parent)) continue;
    if ("layoutPositioning" in node) (node as any).layoutPositioning = "ABSOLUTE";
    (parent as ChildrenMixin).insertChild((parent as ChildrenMixin).children.length, node);
    count++;
  }
  sendStatus(`${count} → top (absolute)`, "success");
}

// 🔲 Grid — arrange selection (or a section's children) into a grid, grouped by size
async function gridLayout(): Promise<void> {
  const GRID_GAP = 48, GROUP_GAP = 80, SECTION_PADDING = 100;
  const selection = [...figma.currentPage.selection];
  const sectionMode = selection.length === 1 && selection[0].type === "SECTION";
  const nodes: any[] = sectionMode ? [...(selection[0] as SectionNode).children] : selection;
  const section = sectionMode ? (selection[0] as SectionNode) : null;
  if (nodes.length < 2) { sendStatus("Select 2+ objects or a section", "error"); return; }

  const getPos = (n: any) => sectionMode ? { x: n.x, y: n.y } : { x: n.absoluteBoundingBox.x, y: n.absoluteBoundingBox.y };
  const minH = Math.min(...nodes.map((n) => Math.round(n.height)));
  const rowTolerance = Math.max(20, minH * 0.4);
  nodes.sort((a, b) => {
    const pa = getPos(a), pb = getPos(b);
    if (Math.abs(pa.y - pb.y) > rowTolerance) return pa.y - pb.y;
    return pa.x - pb.x;
  });

  const groupMap = new Map<string, any[]>();
  for (const node of nodes) {
    const key = `${Math.round(node.width)}x${Math.round(node.height)}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(node);
  }
  const sortedGroups = [...groupMap.values()].sort(
    (a, b) => Math.round(a[0].width) * Math.round(a[0].height) - Math.round(b[0].width) * Math.round(b[0].height)
  );

  if (sectionMode && section) {
    let currentGroupY = SECTION_PADDING;
    for (const group of sortedGroups) {
      const nodeW = Math.round(group[0].width), nodeH = Math.round(group[0].height);
      const cols = Math.ceil(Math.sqrt(group.length));
      group.forEach((node, i) => {
        node.x = SECTION_PADDING + (i % cols) * (nodeW + GRID_GAP);
        node.y = currentGroupY + Math.floor(i / cols) * (nodeH + GRID_GAP);
      });
      const rows = Math.ceil(group.length / cols);
      currentGroupY += rows * nodeH + (rows - 1) * GRID_GAP + GROUP_GAP;
    }
    let maxX = 0, maxY = 0;
    for (const node of nodes) { maxX = Math.max(maxX, node.x + node.width); maxY = Math.max(maxY, node.y + node.height); }
    section.resizeWithoutConstraints(maxX + SECTION_PADDING, maxY + SECTION_PADDING);
  } else {
    let startX = Infinity, startY = Infinity;
    for (const node of nodes) { const bb = node.absoluteBoundingBox; if (!bb) continue; if (bb.x < startX) startX = bb.x; if (bb.y < startY) startY = bb.y; }
    let currentGroupY = startY;
    for (const group of sortedGroups) {
      const nodeW = Math.round(group[0].width), nodeH = Math.round(group[0].height);
      const cols = Math.ceil(Math.sqrt(group.length));
      group.forEach((node, i) => {
        const targetAbsX = startX + (i % cols) * (nodeW + GRID_GAP);
        const targetAbsY = currentGroupY + Math.floor(i / cols) * (nodeH + GRID_GAP);
        const bb = node.absoluteBoundingBox; if (!bb) return;
        node.x += targetAbsX - bb.x;
        node.y += targetAbsY - bb.y;
      });
      const rows = Math.ceil(group.length / cols);
      currentGroupY += rows * nodeH + (rows - 1) * GRID_GAP + GROUP_GAP;
    }
  }
  sendStatus(`Grid: ${nodes.length} in ${sortedGroups.length} group(s)`, "success");
}

// 🔷 Component — wrap each selected object into a master component, preserving properties
async function makeComponents(): Promise<void> {
  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) { sendStatus("Select objects", "error"); return; }
  const created: ComponentNode[] = [];

  for (const node of selection) {
    const parent = node.parent;
    if (!parent || !("insertChild" in parent)) continue;
    const insertIndex = (parent as ChildrenMixin).children.indexOf(node as SceneNode);
    const component = figma.createComponent();
    component.name = node.name;

    if (node.type === "FRAME") {
      const f = node as FrameNode;
      const transform = f.relativeTransform;
      component.resize(f.width, f.height);
      component.opacity = f.opacity;
      component.blendMode = f.blendMode;
      component.clipsContent = f.clipsContent;
      component.fills = JSON.parse(JSON.stringify(f.fills));
      component.strokes = JSON.parse(JSON.stringify(f.strokes));
      component.strokeWeight = f.strokeWeight as number;
      component.strokeAlign = f.strokeAlign;
      component.effects = JSON.parse(JSON.stringify(f.effects));
      if (f.cornerRadius !== figma.mixed) {
        component.cornerRadius = f.cornerRadius as number;
      } else {
        component.topLeftRadius = f.topLeftRadius;
        component.topRightRadius = f.topRightRadius;
        component.bottomLeftRadius = f.bottomLeftRadius;
        component.bottomRightRadius = f.bottomRightRadius;
      }
      if (f.layoutMode !== "NONE") {
        component.layoutMode = f.layoutMode;
        component.primaryAxisSizingMode = f.primaryAxisSizingMode;
        component.counterAxisSizingMode = f.counterAxisSizingMode;
        component.primaryAxisAlignItems = f.primaryAxisAlignItems;
        component.counterAxisAlignItems = f.counterAxisAlignItems;
        component.paddingLeft = f.paddingLeft;
        component.paddingRight = f.paddingRight;
        component.paddingTop = f.paddingTop;
        component.paddingBottom = f.paddingBottom;
        component.itemSpacing = f.itemSpacing;
      }
      (parent as ChildrenMixin).insertChild(insertIndex, component);
      component.relativeTransform = transform;
      for (const child of [...f.children]) {
        component.appendChild(child);
        if ("constraints" in child) (child as any).constraints = { horizontal: "SCALE", vertical: "SCALE" };
      }
      f.remove();
    } else {
      const bb = node.absoluteBoundingBox;
      if (!bb) continue;
      const parentAbsX = parent.type === "PAGE" ? 0 : (parent as SceneNode).absoluteTransform[0][2];
      const parentAbsY = parent.type === "PAGE" ? 0 : (parent as SceneNode).absoluteTransform[1][2];
      component.fills = [];
      component.clipsContent = false;
      component.resize(Math.round(bb.width), Math.round(bb.height));
      (parent as ChildrenMixin).insertChild(insertIndex, component);
      component.x = bb.x - parentAbsX;
      component.y = bb.y - parentAbsY;
      component.appendChild(node);
      const nodeBBAfter = (node as any).absoluteBoundingBox;
      if (nodeBBAfter) {
        (node as any).x -= nodeBBAfter.x - component.absoluteTransform[0][2];
        (node as any).y -= nodeBBAfter.y - component.absoluteTransform[1][2];
      }
      if ("constraints" in node) (node as any).constraints = { horizontal: "SCALE", vertical: "SCALE" };
    }
    created.push(component);
  }

  figma.currentPage.selection = created;
  sendStatus(`${created.length} component(s) created`, "success");
}

// ✂️ Slice ×2.67 — rescale selection by 2.67, round to even, stack into a section
async function scaleSelection267(): Promise<void> {
  const GAP = 80, SECTION_PADDING = 100, SCALE = 2.67;
  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) { sendStatus("Select objects", "error"); return; }
  const roundEven = (v: number) => Math.round(v / 2) * 2;

  for (const node of selection) {
    if (!("rescale" in node)) continue;
    (node as any).rescale(SCALE);
    if ("resize" in node) (node as any).resize(roundEven((node as any).width), roundEven((node as any).height));
  }

  const section = figma.createSection();
  section.name = "Slice / 2.67";
  figma.currentPage.appendChild(section);

  let currentY = SECTION_PADDING, maxWidth = 0;
  for (const node of [...selection]) {
    section.appendChild(node);
    (node as any).x = SECTION_PADDING;
    (node as any).y = currentY;
    currentY += (node as any).height + GAP;
    maxWidth = Math.max(maxWidth, (node as any).width);
  }
  section.resizeWithoutConstraints(maxWidth + SECTION_PADDING * 2, currentY - GAP + SECTION_PADDING);
  figma.viewport.scrollAndZoomIntoView([section]);
  sendStatus("Slice ×2.67 done", "success");
}

// ─── Custom JSON "recipe" scripts ────────────────────────────────

function hexToRgb(hex: string): RGB {
  let h = (hex || "#000000").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (isNaN(n) || h.length < 6) return { r: 0, g: 0, b: 0 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, typeof v === "number" && !isNaN(v) ? v : 0));
}

function fillTemplate(s: string, node: SceneNode, i: number, origName: string): string {
  return String(s == null ? "" : s)
    .replace(/\{w\}/g, String(Math.round(node.width)))
    .replace(/\{h\}/g, String(Math.round(node.height)))
    .replace(/\{i\}/g, String(i))
    .replace(/\{name\}/g, origName);
}

async function applyScriptOp(node: any, op: any, i: number, origName: string): Promise<void> {
  switch (op && op.op) {
    case "move":    if ("x" in node) { node.x += Number(op.dx) || 0; node.y += Number(op.dy) || 0; } break;
    case "pos":     if (op.x != null) node.x = Number(op.x); if (op.y != null) node.y = Number(op.y); break;
    case "resize":  if ("resize" in node) node.resize(op.w != null ? Number(op.w) : node.width, op.h != null ? Number(op.h) : node.height); break;
    case "opacity": if ("opacity" in node) node.opacity = clamp01(Number(op.value)); break;
    case "rotate":  if ("rotation" in node) node.rotation = Number(op.deg) || 0; break;
    case "corner":  if ("cornerRadius" in node) node.cornerRadius = Number(op.value) || 0; break;
    case "visible": node.visible = !!op.value; break;
    case "lock":    node.locked = !!op.value; break;
    case "fill":    if ("fills" in node) node.fills = [{ type: "SOLID", color: hexToRgb(op.color), opacity: op.opacity != null ? clamp01(Number(op.opacity)) : 1 }]; break;
    case "stroke":  if ("strokes" in node) { node.strokes = [{ type: "SOLID", color: hexToRgb(op.color) }]; if (op.weight != null && "strokeWeight" in node) node.strokeWeight = Number(op.weight); } break;
    case "rename":  node.name = fillTemplate(op.name, node as SceneNode, i, origName); break;
    case "text":    if (node.type === "TEXT") { const f = (node as TextNode).fontName; if (f !== figma.mixed) { await figma.loadFontAsync(f as FontName); (node as TextNode).characters = String(op.value == null ? "" : op.value); } } break;
  }
}

async function runScript(script: any): Promise<void> {
  const sel = [...figma.currentPage.selection];
  if (sel.length === 0) { sendStatus("Select objects", "error"); return; }
  const ops = script && Array.isArray(script.ops) ? script.ops : null;
  if (!ops || ops.length === 0) { sendStatus("Script has no ops", "error"); return; }
  let i = 0;
  for (const node of sel) {
    i++;
    const origName = node.name;
    for (const op of ops) {
      try { await applyScriptOp(node, op, i, origName); } catch (_e) {}
    }
  }
  sendStatus(`Ran ${ops.length} ops on ${sel.length}`, "success");
}

// ─── Custom user buttons: JSON "Code" scripts ────────────────────

async function runCustomFn(fn: string, script?: any): Promise<void> {
  if (fn === "__script") await runScript(script);
}

// ─── UI Setup ────────────────────────────────────────────────────

figma.showUI(__html__, { width: 250, height: 62, themeColors: true });

// ─── Window positioning ──────────────────────────────────────────

let uiPos = "center";
let lastW = 250;
let lastH = 62;

function repositionUI(pos: string): void {
  const b = figma.viewport.bounds;
  const z = figma.viewport.zoom || 1;
  const wc = lastW / z;
  const hc = lastH / z;
  const m = 16 / z;
  let x: number, y: number;
  switch (pos) {
    case "tl": x = b.x + m; y = b.y + m; break;
    case "tr": x = b.x + b.width - wc - m; y = b.y + m; break;
    case "bl": x = b.x + m; y = b.y + b.height - hc - m * 3.5; break;
    case "br": x = b.x + b.width - wc - m; y = b.y + b.height - hc - m * 3.5; break;
    default:   x = b.x + (b.width - wc) / 2; y = b.y + (b.height - hc) / 2; break;
  }
  try { figma.ui.reposition(x, y); } catch (_e) {}
}

(async () => {
  uiPos = (await figma.clientStorage.getAsync("uiPos")) || "center";
  figma.ui.postMessage({ type: "pos", pos: uiPos });
  repositionUI(uiPos);
})();

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

// Track the last node added to the selection (for Replace's reference object)
let lastAddedId: string | null = null;
let prevSelIds = new Set<string>();
function trackLastAdded() {
  const ids = figma.currentPage.selection.map((n) => n.id);
  for (const id of ids) {
    if (!prevSelIds.has(id)) lastAddedId = id;
  }
  prevSelIds = new Set(ids);
}

figma.on("selectionchange", () => {
  trackLastAdded();
  sendSelectionInfo();
});
trackLastAdded();
sendSelectionInfo();

figma.ui.onmessage = async (msg: { type: string }) => {
  switch (msg.type) {
    case "dark-theme-copy":
      await darkThemeCopy();
      break;
    case "wrap-selection":
      await wrapToNewSelection(true);
      break;
    case "wrap-selection-light":
      await wrapToNewSelection(false);
      break;
    case "calc-size":
      await calculateSize();
      break;
    case "align-sections":
      await alignSections();
      break;
    case "expand-section":
      await expandSectionGrow("right");
      break;
    case "expand-section-left":
      await expandSectionGrow("left");
      break;
    case "replace-instance":
      await replaceWithInstance();
      break;
    case "find-similar":
      await findSimilar();
      break;
    case "smart-copy":
      await smartCopy();
      break;
    case "toggle-dev-status":
      await toggleDevStatus();
      break;
    case "move-to-zero": {
      const sel = figma.currentPage.selection;
      if (sel.length === 1) {
        sel[0].x = 0;
        sel[0].y = 0;
      }
      break;
    }
    case "fix-selection":
      await fixSelection(true);
      break;
    case "fix-selection-light":
      await fixSelection(false);
      break;
    case "create-art-block":
      await createArtBlock();
      break;
    case "frame-border":
      await frameWithBorder();
      break;
    case "frame-540":
      await frame540();
      break;
    case "grid-layout":
      await gridLayout();
      break;
    case "make-component":
      await makeComponents();
      break;
    case "custom-absolute":
      await customIgnoreAutoLayout();
      break;
    case "slice-267":
      await scaleSelection267();
      break;
    case "custom-fn":
      await runCustomFn((msg as any).fn, (msg as any).script);
      break;
    case "get-custom": {
      const custom = (await figma.clientStorage.getAsync("customTools")) || null;
      figma.ui.postMessage({ type: "custom", custom });
      break;
    }
    case "save-custom":
      await figma.clientStorage.setAsync("customTools", (msg as any).custom);
      break;
    case "get-removed": {
      const removed = (await figma.clientStorage.getAsync("removedTools")) || null;
      figma.ui.postMessage({ type: "removed", removed });
      break;
    }
    case "save-removed":
      await figma.clientStorage.setAsync("removedTools", (msg as any).removed);
      break;
    case "request-selection":
      sendSelectionInfo();
      break;
    case "notify":
      figma.notify((msg as any).text, (msg as any).error ? { error: true } : undefined);
      break;
    case "get-order": {
      const order = (await figma.clientStorage.getAsync("toolOrder")) || null;
      console.log("get-order:", order);
      figma.ui.postMessage({ type: "order", order });
      break;
    }
    case "save-order":
      await figma.clientStorage.setAsync("toolOrder", (msg as any).order);
      break;
    case "get-theme": {
      const light = (await figma.clientStorage.getAsync("lightTheme")) || false;
      console.log("get-theme:", light);
      figma.ui.postMessage({ type: "theme", light });
      break;
    }
    case "save-theme":
      await figma.clientStorage.setAsync("lightTheme", (msg as any).light);
      break;
    case "get-wf": {
      const wf = await figma.clientStorage.getAsync("wfTheme");
      figma.ui.postMessage({ type: "wf", on: wf == null ? true : wf });
      break;
    }
    case "save-wf":
      await figma.clientStorage.setAsync("wfTheme", (msg as any).on);
      break;
    case "reset-all":
      await figma.clientStorage.deleteAsync("uiPos");
      await figma.clientStorage.deleteAsync("lightTheme");
      await figma.clientStorage.deleteAsync("toolOrder");
      await figma.clientStorage.deleteAsync("customTools");
      await figma.clientStorage.deleteAsync("removedTools");
      await figma.clientStorage.deleteAsync("wfTheme");
      uiPos = "center";
      figma.ui.postMessage({ type: "pos", pos: uiPos });
      figma.ui.postMessage({ type: "theme", light: false });
      figma.ui.postMessage({ type: "order", order: null });
      figma.ui.postMessage({ type: "custom", custom: null });
      figma.ui.postMessage({ type: "removed", removed: null });
      figma.ui.postMessage({ type: "wf", on: true });
      repositionUI(uiPos);
      figma.notify("Settings reset to default");
      break;
    case "set-pos":
      uiPos = (msg as any).pos || "center";
      await figma.clientStorage.setAsync("uiPos", uiPos);
      repositionUI(uiPos);
      break;
    case "resize": {
      // Only update a dimension when it's actually provided; keep the other as-is.
      // (Panels like Settings post width only — never let height become undefined.)
      const w = (msg as any).width, h = (msg as any).height;
      if (w != null && w > 0) lastW = Math.round(w);
      if (h != null && h > 0) lastH = Math.round(h);
      lastW = Math.max(lastW || 1, 1);
      lastH = Math.max(lastH || 1, 1);
      figma.ui.resize(lastW, lastH);
      repositionUI(uiPos);
      break;
    }
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
