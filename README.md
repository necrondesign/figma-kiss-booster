# Kiss booster

Figma plugin with a set of tools for speeding up design workflows — dark theme generation, section management, art task calculations, design stickers and built-in translator.

## Features

### Tools tab

**Wrap to new selection**
Select frames on the canvas → plugin aligns them horizontally (80px gap), creates dark theme copies below each frame (160px gap) using Figma variable modes, and wraps everything into a Section with a fill token applied. If no dark mode exists in the file, frames are wrapped without dark copies.

**Fix selection**
Select a Section → plugin re-aligns light frames inside, removes old dark copies, creates fresh ones, and resizes the Section to fit.

**Expand selection**
Select a Section → plugin calculates the gap and width of existing frames inside and expands the Section to the right by one gap + one frame width.

**Align all sections**
Aligns all Sections on the current page (or selected ones) horizontally with 400px gap between them.

**Make 1px gap**
Wraps each selected object into a frame with 1px padding on all sides. Handles rotated objects correctly using absolute bounding box. The wrapper frame has no fill or stroke — just structure.

### Task & status tab

**Create art task**
Select objects → plugin creates an instance of the ArtTask component from the linked design system next to each object (240px to the right). Automatically fills two fields:
- Object dimensions (e.g. `80x80px`)
- Art production size — scales to the nearest art group (160×160, 320×320, 540×800), rounds up to even, multiplies by 3 for retina (e.g. `480x480px`)

**Create status**
Enter custom text or leave empty for a random name (Какашечка, Шляпа, Пук-Пук, Техдолг, Кусь). Plugin creates a Design Sticker instance with a random emotion (Emotion1–Emotion60) positioned above the selected object.

### Translator tab

**Translate selection**
Select layers containing text → choose target language from the dropdown → plugin translates all text layers using Google Translate API and applies the results back to the text nodes. Supports mixed font styles.

Available languages: Russian, English, German, Polish, Arabic, Chinese, Spanish, French, Portuguese, Japanese, Korean.

## Installation

1. Clone or download this repository
2. Run `npm install` and `npm run build`
3. In Figma: Plugins → Development → Import plugin from manifest → select `manifest.json`

## Development

```
npm install
npm run build    # compile once
npm run watch    # compile on changes
```

## Requirements

- Figma desktop app
- For dark theme features: variable collection with a "Dark" mode
- For art task / sticker features: linked design system with ArtTask and Design Sticker components (at least one instance placed in the file)
