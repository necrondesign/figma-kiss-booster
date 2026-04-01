// KISS Booster — Figma Plugin

const H_GAP = 80;
const V_GAP = 160;
const SECTION_PADDING = 100;

// ─── Helpers ─────────────────────────────────────────────────────

function sendStatus(text: string, status: "success" | "error" | "") {
  figma.ui.postMessage({ type: "status", text, status });
}

async function findDarkMode(): Promise<{ collection: VariableCollection; modeId: string } | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    const darkMode = collection.modes.find(
      (m) => m.name.toLowerCase() === "dark"
    );
    if (darkMode) {
      return { collection, modeId: darkMode.modeId };
    }
  }
  return null;
}

async function findVariable(name: string): Promise<Variable | null> {
  // Get ALL local variables (no type filter)
  const allVars = await figma.variables.getLocalVariablesAsync();

  const search = (vars: Variable[]) => {
    // 1. Exact match
    const exact = vars.find((v) => v.name === name);
    if (exact) return exact;
    // 2. Match by last path segment
    const byEnd = vars.find((v) => v.name.endsWith("/" + name));
    if (byEnd) return byEnd;
    // 3. Partial case-insensitive
    const partial = vars.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    return partial ?? null;
  };

  const found = search(allVars);
  if (found) return found;

  figma.notify(`⚠ Variable "${name}" not found (searched ${allVars.length} vars)`, { timeout: 5000 });
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
    const baseFill: SolidPaint = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
    section.fills = [figma.variables.setBoundVariableForPaint(baseFill, "color", fillVar)];
  } else {
    figma.notify("⚠ Variable \"default_system_frame\" not found");
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

  // Sort by current x position to preserve order
  sections.sort((a, b) => a.x - b.x);

  // Align: same Y, horizontal with gap
  const baseY = sections[0].y;
  let nextX = sections[0].x;

  for (const section of sections) {
    section.x = nextX;
    section.y = baseY;
    nextX = nextX + section.width + SECTION_GAP;
  }

  figma.currentPage.selection = sections;
  figma.viewport.scrollAndZoomIntoView(sections);
  sendStatus(`${sections.length} sections aligned`, "success");
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

  for (const section of sections) {
    // Get top-row children (light frames, skip sections and dark copies)
    const children: SceneNode[] = [];
    for (const child of section.children) {
      if (child.type === "SECTION") continue;
      if (child.name.endsWith(" — Dark")) continue;
      children.push(child);
    }

    if (children.length === 0) {
      section.resizeWithoutConstraints(section.width + MIN_GAP + 540, section.height);
      continue;
    }

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
    const expandAmount = gapSize + lastWidth;

    section.resizeWithoutConstraints(section.width + expandAmount, section.height);
  }

  sendStatus(`${sections.length} expanded`, "success");
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
  if (!dark) {
    sendStatus("Dark mode not found", "error");
    return;
  }

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

  // Create dark copies below each light frame
  const clones: SceneNode[] = [];
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
  sendStatus(`Fixed ${lightFrames.length} + ${clones.length} dark`, "success");
}

// ─── Feature 7: Create Art Block ─────────────────────────────────

const ART_BLOCK_GAP = 240;

async function findArtTaskComponent(): Promise<ComponentNode | null> {
  // Search all pages for any instance or component named "ArtTask" or containing "Art Task"
  const pages = figma.root.children;
  for (const page of pages) {
    const search = page.findOne((n) => {
      const name = n.name.toLowerCase().replace(/\s+/g, "");
      if (n.type === "INSTANCE" && name.includes("arttask")) return true;
      if (n.type === "COMPONENT" && name.includes("arttask")) return true;
      return false;
    });

    if (search) {
      if (search.type === "COMPONENT") return search;
      if (search.type === "INSTANCE") {
        const main = (search as InstanceNode).mainComponent;
        if (main) return main;
      }
    }
  }
  return null;
}

async function createArtBlock(): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select objects", "error");
    return;
  }

  // Find the ArtTask component (local or from library)
  let component = await findArtTaskComponent();

  if (!component) {
    sendStatus("ArtTask not found in file", "error");
    return;
  }

  // If component is from a library, import it
  if (component.remote) {
    try {
      component = await figma.importComponentByKeyAsync(component.key);
    } catch (_e) {
      sendStatus("Can't import ArtTask", "error");
      return;
    }
  }

  // Art size groups
  const ART_GROUPS: [number, number][] = [
    [160, 160],
    [320, 320],
    [540, 800],
  ];
  const ceilEven = (n: number) => Math.ceil(n / 2) * 2;

  const instances: SceneNode[] = [];

  for (const node of selection) {
    const w = Math.round(node.width);
    const h = Math.round(node.height);
    const sizeText = `${w}x${h}px`;

    // Find group
    let group = ART_GROUPS[ART_GROUPS.length - 1];
    for (const g of ART_GROUPS) {
      if (w <= g[0] && h <= g[1]) {
        group = g;
        break;
      }
    }

    const scale = Math.min(group[0] / w, group[1] / h);
    const artW = ceilEven(w * scale);
    const artH = ceilEven(h * scale);
    const retW = artW * 3;
    const retH = artH * 3;
    const size3xText = `${retW}x${retH}px`;

    // Create instance using absolute position
    const bb = node.absoluteBoundingBox;
    if (!bb) continue;
    const instance = component.createInstance();
    instance.x = bb.x + bb.width + ART_BLOCK_GAP;
    instance.y = bb.y;

    // Find IconTags and fill text
    const iconTags = findIconTags(instance);
    if (iconTags.length >= 3) {
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

    instances.push(instance);
  }

  figma.currentPage.selection = instances;
  figma.viewport.scrollAndZoomIntoView([...selection, ...instances]);
  sendStatus(`${instances.length} art blocks created`, "success");
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

// ─── Feature 9: Design Sticker ───────────────────────────────────

const RANDOM_TEXTS = ["Какашечка", "Шляпа", "Пук-Пук", "Техдолг", "Кусь"];

async function findDesignStickerComponent(): Promise<ComponentNode | ComponentSetNode | null> {
  const pages = figma.root.children;
  for (const page of pages) {
    const search = page.findOne((n) => {
      const name = n.name.toLowerCase().replace(/\s+/g, "");
      if (n.type === "INSTANCE" && name.includes("designsticker")) return true;
      if (n.type === "COMPONENT" && name.includes("designsticker")) return true;
      return false;
    });
    if (search) {
      if (search.type === "COMPONENT") {
        // Check if part of a component set
        if (search.parent && search.parent.type === "COMPONENT_SET") {
          return search.parent;
        }
        return search;
      }
      if (search.type === "INSTANCE") {
        const main = (search as InstanceNode).mainComponent;
        if (main) {
          if (main.parent && main.parent.type === "COMPONENT_SET") {
            return main.parent;
          }
          return main;
        }
      }
    }
  }
  return null;
}

async function createDesignSticker(customName: string): Promise<void> {
  const selection = [...figma.currentPage.selection];

  if (selection.length === 0) {
    sendStatus("Select an object", "error");
    return;
  }

  // Find Design Sticker component
  const found = await findDesignStickerComponent();
  if (!found) {
    sendStatus("Design Sticker not found", "error");
    return;
  }

  let stickerComponent: ComponentNode = found.type === "COMPONENT_SET"
    ? (found.children[0] as ComponentNode)
    : found;

  if (stickerComponent.remote) {
    try {
      stickerComponent = await figma.importComponentByKeyAsync(stickerComponent.key);
    } catch (_e) {
      sendStatus("Can't import sticker", "error");
      return;
    }
  }

  const text = customName.trim() || RANDOM_TEXTS[Math.floor(Math.random() * RANDOM_TEXTS.length)];

  const instance = stickerComponent.createInstance();

  // Swap the "Instance" property to a random Emotion using preferredValues
  try {
    const defs = stickerComponent.componentPropertyDefinitions;
    for (const [key, def] of Object.entries(defs)) {
      if (def.type === "INSTANCE_SWAP" && def.preferredValues && def.preferredValues.length > 0) {
        const randomPref = def.preferredValues[Math.floor(Math.random() * def.preferredValues.length)];
        const imported = await figma.importComponentByKeyAsync(randomPref.key);
        instance.setProperties({ [key]: imported.id });
        break;
      }
    }
  } catch (_e) {
    // Swap failed silently, keep default emotion
  }

  // Position above the selected element, -40px up
  const target = selection[0];
  const bb = target.absoluteBoundingBox;
  if (bb) {
    instance.x = bb.x;
    instance.y = bb.y - instance.height + 40;
  }

  // Move sticker above the target in layer order
  const targetParent = target.parent;
  if (targetParent && "children" in targetParent) {
    const idx = (targetParent as ChildrenMixin).children.indexOf(target as SceneNode);
    (targetParent as ChildrenMixin).insertChild(idx + 1, instance);
    instance.x = bb ? bb.x - (targetParent as SceneNode).absoluteTransform[0][2] : instance.x;
    instance.y = bb ? bb.y - instance.height + 40 - (targetParent as SceneNode).absoluteTransform[1][2] : instance.y;
  }

  // Find text node inside and set text
  const texts = findTextNodes(instance);
  if (texts.length > 0) {
    const textNode = texts[0];
    const fontName = textNode.fontName;
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
    textNode.characters = text;
  }

  figma.currentPage.selection = [instance];
  figma.viewport.scrollAndZoomIntoView([instance]);
  sendStatus(`Sticker: ${text}`, "success");
}

// ─── UI Setup ────────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 470, themeColors: true });

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
    case "fix-selection":
      await fixSelection();
      break;
    case "create-art-block":
      await createArtBlock();
      break;
    case "frame-border":
      await frameWithBorder();
      break;
    case "create-sticker":
      await createDesignSticker((msg as any).name || "");
      break;
    case "request-selection":
      sendSelectionInfo();
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
