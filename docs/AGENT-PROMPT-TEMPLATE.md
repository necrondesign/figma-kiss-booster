# Agent Prompt Templates

Use these templates when working with 9B parameter models.

---

## TEMPLATE 1: Initial Session (Iterations 1-4)

```markdown
# Task: Build Kiss Booster Figma Plugin from Scratch

You are a software engineer implementing a Figma plugin based on detailed specifications.

## Project Context
- **Name:** Kiss Booster
- **Type:** Figma Plugin (TypeScript + vanilla HTML/JS)
- **Build:** npm + TypeScript Compiler
- **Target:** 20 iterations, 1 iteration per session
- **Model constraint:** 9B parameters = small context window

## Your Guide
📖 **PRIMARY GUIDE:** `docs/BUILD-FROM-SCRATCH.md`
- Contains all 20 iterations with EXACT code
- Use this file as your only source of truth
- Copy code exactly as shown, no modifications

## Supporting Docs (if needed)
- `docs/CLAUDE.md` — Full architecture (for understanding context)
- `docs/FIGMA-API.md` — Figma API quick reference
- `docs/PROGRESS.md` — Progress tracking

## Mission for This Session
**Complete ITERATIONS 1-4**

### ITERATION 1
- Read: `docs/BUILD-FROM-SCRATCH.md` → find "## ITERATION 1"
- Create 3 files: manifest.json, package.json, tsconfig.json
- Copy code EXACTLY as shown

### ITERATION 2
- Find "## ITERATION 2" in the guide
- Create file: src/code.ts
- Add constants and skeleton
- Copy code EXACTLY

### ITERATION 3
- Find "## ITERATION 3"
- Create file: src/ui.html
- Add HTML structure
- Copy code EXACTLY

### ITERATION 4
- Find "## ITERATION 4"
- Update src/code.ts: add wrapFrames() function
- Update ui.html: add Wrap button
- Copy code EXACTLY

## What NOT to Do
❌ Do NOT run `npm run build` (user will compile)
❌ Do NOT test in Figma (user will test)
❌ Do NOT skip iterations
❌ Do NOT modify code beyond what's shown
❌ Do NOT combine iterations

## What TO Do
✅ Copy code exactly from markdown
✅ Paste into correct files
✅ Report what you created
✅ Stop after iteration 4

## Report Back Format

When done, write:

```
ITERATIONS 1-4 COMPLETE ✅

Files created:
- manifest.json (14 lines)
- package.json (12 lines)
- tsconfig.json (13 lines)
- src/code.ts (25 lines)
- src/ui.html (40 lines)

Total files: 5
Total lines: ~104

Ready for next session (ITERATION 5)
```

## Project Structure
```
/Users/stepan/vibe-coding/figma-kiss-booster/
├── src/
│   ├── code.ts         ← Plugin logic
│   └── ui.html         ← UI toolbar
├── docs/
│   ├── BUILD-FROM-SCRATCH.md  ← YOUR GUIDE
│   ├── CLAUDE.md
│   ├── TZ.md
│   └── PROGRESS.md
├── manifest.json       ← Config
├── package.json        ← Dependencies
├── tsconfig.json       ← TypeScript config
└── [other files]
```

---

## Key Rules
1. **One file = One truth:** BUILD-FROM-SCRATCH.md
2. **No improvisation:** Copy exactly
3. **No compilation:** That's user's job
4. **Clear reports:** List what changed
5. **Stop after 4 iterations:** Don't do more

Good luck! 🚀
```

---

## TEMPLATE 2: Continuation Session (Single Iteration)

```markdown
# Kiss Booster Build — ITERATION [N]

Continuing Figma plugin implementation from previous session.

## Context
- **Repo:** /Users/stepan/vibe-coding/figma-kiss-booster
- **Guide:** docs/BUILD-FROM-SCRATCH.md
- **Previous:** Iterations 1 through [N-1] completed ✅
- **Current:** ITERATION [N]
- **Next:** ITERATION [N+1] (for next session)

## Task: Complete ONE Iteration

### Step 1: Find the iteration
- Open: `docs/BUILD-FROM-SCRATCH.md`
- Search for: `## ITERATION [N]`
- Read the entire section

### Step 2: Implement exactly
- Copy all code shown in that section
- Paste into files shown
- Maintain exact formatting and syntax
- No modifications whatsoever

### Step 3: Report back
- List files modified
- Show line counts before/after
- Confirm ITERATION [N] COMPLETE

## Expected Changes for ITERATION [N]

[Get this from BUILD-FROM-SCRATCH.md for iteration N]

Example:
```
Files to modify:
- src/code.ts: Add moveToZero() function, update message handler
- ui.html: Add Zero button to toolbar

Expected lines added: ~30
```

## Critical Rules
❌ No npm run build
❌ No testing in Figma
❌ No code modifications
❌ No combining with other iterations
❌ No skipping steps

✅ Copy exact code
✅ Use correct file paths
✅ Update message handlers
✅ Report line counts
✅ Stop when done

## Report Format

```
ITERATION [N] COMPLETE ✅

Files modified:
- src/code.ts: Added function X(), updated message handler
- ui.html: Added button Y

File statistics:
- src/code.ts: ~XXX total lines (added ~YY)
- ui.html: ~ZZZ total lines (added ~WW)

Status: Ready for ITERATION [N+1]
```

## Reference: File Locations
- Plugin code: `/src/code.ts` (main logic)
- UI code: `/src/ui.html` (toolbar)
- Build config: `manifest.json`, `package.json`, `tsconfig.json`
- Project root: `/Users/stepan/vibe-coding/figma-kiss-booster/`

## If You Get Stuck
1. Re-read the iteration section in BUILD-FROM-SCRATCH.md
2. Check exact file paths
3. Look for "Update:", "Add:", "Replace:" instructions
4. Copy code exactly including indentation
5. If still stuck: Report what's unclear, don't guess

Good luck with ITERATION [N]! 🚀
```

---

## TEMPLATE 3: Mid-Session Redirect (Agent confused)

```markdown
# Redirect: Focus on BUILD-FROM-SCRATCH.md

You seem to be asking questions or modifying code beyond what's needed.

**Remember:** Your ONLY source of truth is `docs/BUILD-FROM-SCRATCH.md`

### What to do:
1. Open: docs/BUILD-FROM-SCRATCH.md
2. Find: ## ITERATION [N]
3. Copy: ALL code shown
4. Paste: Into files exactly
5. Stop: Report what changed

### Do NOT:
- Ask about how things work
- Modify code from the guide
- Add extra error handling
- Change function signatures
- Test or compile

### DO:
- Copy exactly
- Paste into correct files
- Report file changes
- Move to next iteration

Your job is **transcription**, not **engineering**.

Keep going! 🚀
```

---

## TEMPLATE 4: Status Check (Between Sessions)

```markdown
# Status Check Before ITERATION [N]

Before starting ITERATION [N], confirm:

## Files Should Exist
- [ ] src/code.ts (from iterations 1-[N-1])
- [ ] src/ui.html (from iterations 1-[N-1])
- [ ] manifest.json
- [ ] package.json
- [ ] tsconfig.json

## Code Should Contain (from iterations 1-[N-1])
- [ ] Constants (H_GAP, V_GAP, etc.)
- [ ] Message handler with cases for: [list based on prior iterations]
- [ ] Selection change listener
- [ ] UI toolbar with buttons: [list based on prior iterations]

## If Any Are Missing
→ Something went wrong in a previous iteration
→ Review PROGRESS.md to see what was completed
→ Go back to BUILD-FROM-SCRATCH.md for that iteration
→ Redo it with exact code

## If All Are Present
→ You're ready for ITERATION [N]
→ Continue with the prompt template

Good to go! ✅
```

---

## How to Use These Templates

### Session 1 (Iterations 1-4)
Copy **TEMPLATE 1** → Replace placeholders → Give to agent

### Sessions 2-20 (One iteration each)
Copy **TEMPLATE 2** → Replace `[N]` with iteration number → Give to agent

### If Agent Gets Confused
Copy **TEMPLATE 3** → Give to agent → Have them refocus

### Before Important Iterations
Copy **TEMPLATE 4** → Use as pre-flight check

---

## Tips for Best Results

1. **Be specific:** Always use exact iteration numbers
2. **Point to guide:** Always reference `BUILD-FROM-SCRATCH.md`
3. **Keep focus:** One iteration = one session
4. **Clear expectations:** Show expected code before agent starts
5. **Simple reports:** Ask for structured output (lists, not prose)
6. **No negotiation:** Code is copy-paste exact, no creativity

---

## Variables to Replace

When using templates:

| Variable | Example | Description |
|----------|---------|-------------|
| `[N]` | `5` | Current iteration number |
| `[N-1]` | `4` | Previous iteration number |
| `[N+1]` | `6` | Next iteration number |
| `/Users/stepan/...` | Keep as is | Project absolute path |

---

**Save these templates for quick access when starting new sessions!** 💾
