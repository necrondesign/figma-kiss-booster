# Agent Troubleshooting Guide

When 9B model agent goes off-track, use these fixes.

---

## Problem 1: Agent Skips Iterations

**Symptom:**
```
Agent says: "I see errors in ITERATION 11... let me jump to ITERATION 15"
```

**Cause:** Agent is trying to be "smart" and fix things

**Fix:**
Send this immediately:

```markdown
# STOP AND REDIRECT

You skipped iterations. This is WRONG.

Your job is ONLY:
1. Complete ITERATION [CORRECT_N]
2. Copy code from BUILD-FROM-SCRATCH.md
3. Paste into files
4. Report changes
5. STOP

Do NOT:
- Skip iterations
- Jump to different iteration
- Combine iterations
- Judge your own code

Go back and do ITERATION [CORRECT_N] now.
Do exactly what's in BUILD-FROM-SCRATCH.md ## ITERATION [CORRECT_N]
```

Replace `[CORRECT_N]` with the iteration number that should have been done.

---

## Problem 2: Agent Runs npm run build

**Symptom:**
```
Agent says: "Running npm run build... got TypeScript errors..."
```

**Cause:** Agent thinks it should compile

**Fix:**
Send immediately:

```markdown
# STOP COMPILING

Do NOT run npm run build.

Your job is ONLY writing code, not compiling.

Go back to your work:
1. Copy code from BUILD-FROM-SCRATCH.md
2. Paste into files
3. Report changes
4. STOP

That's all. Do NOT compile.
```

---

## Problem 3: Agent Modifies Code

**Symptom:**
```
Agent says: "I simplified the code..." or "I think this is cleaner..."
```

**Cause:** Agent thinks it can improve code

**Fix:**
Send immediately:

```markdown
# NO MODIFICATIONS

You are NOT allowed to change code from BUILD-FROM-SCRATCH.md

Your job is EXACT COPY-PASTE ONLY:
1. Find ## ITERATION [N] in BUILD-FROM-SCRATCH.md
2. Copy code exactly as shown
3. Paste into files without changes
4. Report what you pasted
5. STOP

Do NOT:
- Simplify code
- Add error handling
- Change function signatures
- "Improve" anything

Go back and copy EXACTLY.
```

---

## Problem 4: Agent Asks Questions

**Symptom:**
```
Agent says: "Should I add error handling here?" or "Why does this work this way?"
```

**Cause:** Agent is confused

**Fix:**
Send immediately:

```markdown
# NO QUESTIONS

Do NOT ask why or how.

Your job is ONLY:
1. Find ## ITERATION [N] in BUILD-FROM-SCRATCH.md
2. Copy code
3. Paste into files
4. Report changes
5. STOP

Do NOT ask questions.
Do NOT think about the code.
Just copy and paste.

Continue with ITERATION [N] now.
```

---

## Problem 5: Agent Tries to Test in Figma

**Symptom:**
```
Agent says: "Loading in Figma to test..." or "Testing the plugin..."
```

**Cause:** Agent thinks it should verify

**Fix:**
Send immediately:

```markdown
# NO TESTING

Do NOT test in Figma.

Your job is ONLY:
1. Copy code from BUILD-FROM-SCRATCH.md
2. Paste into files
3. Report changes
4. STOP

Testing is USER's job after npm run build.

Do NOT test anything.
```

---

## Problem 6: Agent Combines Iterations

**Symptom:**
```
Agent says: "I'll do ITERATION 10 and 11 together..."
```

**Cause:** Agent thinks it's faster

**Fix:**
Send immediately:

```markdown
# ONE ITERATION PER SESSION

You MUST do only ONE iteration per session.

Session goal: ITERATION [N] ONLY

Do NOT:
- Combine with other iterations
- Do multiple iterations
- Skip ahead

ITERATION [N] only.
Then STOP and report.

Next iteration = next session.
```

---

## Problem 7: Agent Reports Wrong Format

**Symptom:**
```
Agent writes long explanation instead of structured report
```

**Cause:** Agent doesn't follow report format

**Fix:**
Send immediately:

```markdown
# WRONG REPORT FORMAT

Your report must be EXACTLY:

```
ITERATION [N] COMPLETE ✅

Modified files:
- src/code.ts: [what you changed]
- src/ui.html: [what you changed]

STOP.
```

Do NOT write explanations or long text.
Do NOT explain why or how.
Just the format above.

Redo ITERATION [N] and report correctly.
```

---

## Problem 8: Agent Gets Stuck

**Symptom:**
```
Agent says: "I don't understand..." or "The code doesn't match..."
```

**Cause:** Something is genuinely unclear

**Fix:**
First, verify the iteration exists:

1. Open: docs/BUILD-FROM-SCRATCH.md
2. Search for: `## ITERATION [N]`
3. Confirm it exists

If it does, send:

```markdown
# Stuck on ITERATION [N]

Re-read BUILD-FROM-SCRATCH.md ## ITERATION [N]

Look for:
- **File: src/code.ts** → tells you which file
- Code block → copy this exactly
- **Update:** or **Add:** → tells you what to do
- Same for ui.html

If you're still confused:
1. Copy the code block exactly (no changes)
2. Paste into the file
3. Report what you did
4. I'll verify

Try again.
```

---

## Quick Fix Checklist

When agent goes off-track, check:

| Issue | Fix |
|-------|-----|
| Skips iterations | Point to correct iteration |
| Runs npm run build | Tell agent: no compilation |
| Modifies code | Tell agent: exact copy-paste |
| Asks questions | Tell agent: no questions |
| Tests in Figma | Tell agent: no testing |
| Does multiple iterations | Tell agent: one per session |
| Wrong report format | Show correct format |
| Actually stuck | Verify iteration exists, resend instructions |

---

## Prevention: Better Prompts

**Before starting iteration, send THIS:**

```markdown
# STRICT: ITERATION [N] ONLY

🎯 Goal: Copy code from BUILD-FROM-SCRATCH.md ## ITERATION [N]
      Paste into files
      Report changes
      STOP

📖 Source: docs/BUILD-FROM-SCRATCH.md (## ITERATION [N])

🚫 Forbidden:
- Skip iterations
- Compile code
- Modify code
- Ask questions
- Test in Figma
- Combine iterations

✅ Required:
- Find ## ITERATION [N]
- Copy exactly
- Paste into files
- Report in format shown

Report format:
```
ITERATION [N] COMPLETE ✅
Modified: src/code.ts, src/ui.html
STOP.
```

Go now.
```

---

## When to Redo an Iteration

If agent:
- ✅ Skipped iterations → **Redo previous**
- ✅ Modified code → **Redo with exact copy**
- ✅ Did multiple iterations → **Redo the extra one**
- ✅ Wrong report → **Redo with correct format**

**How to redo:**
1. Delete what agent added
2. Restore original files
3. Send new prompt
4. Have agent redo that iteration correctly

---

## Red Flags

If agent does ANY of these, STOP immediately:

🚨 "I think the code should..."
🚨 "Let me optimize..."
🚨 "I'm skipping to..."
🚨 "Running npm run build..."
🚨 "Testing in Figma..."
🚨 "Why does..."
🚨 "Let me do two iterations..."

**Response:** Send appropriate fix from above

---

## Summary

**GOLDEN RULE:**
Agent = Copy code from markdown → Paste into file → Report → Stop

If agent does anything else → Use fix from this guide

Keep it simple, keep it strict, keep moving. 🚀
