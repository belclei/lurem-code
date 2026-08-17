# Institution Select Icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual institution logos to the Select component's field and dropdown, making institution selection more intuitive in account and card creation dialogs.

**Architecture:** The `Select` component already supports `icon` rendering in the dropdown via an `icon?: ReactNode` prop on `SelectOption`. We'll:
1. Enhance the field display to also show the selected icon (currently shows only text)
2. Adjust icon sizing from 18px → 24px and add `border-radius: 4px` for consistency with other institution mark instances
3. Wire up `logoAsset` from `InstitutionDto` in all four dialogs (NewAccountDialog, EditAccountDialog, NewCardDialog, EditCardDialog)

**Tech Stack:** React, TypeScript, Tailwind CSS, existing design tokens.

## Global Constraints

- No schema changes — `Institution.logoAsset` already exists and is populated
- Backward compatible — `icon` prop is optional, existing code without icons still works
- Icon is decorative (text is accessible name) — no new a11y concerns
- Sizing: 24px × 24px with `border-radius: 4px`

---

## File Structure

**Modified files:**
- `packages/ui/src/components/Select/Select.tsx` — enhance field display, adjust icon sizing/radius
- `apps/web/src/routes/timeline/NewAccountDialog.tsx` — pass `icon` in options
- `apps/web/src/routes/timeline/EditAccountDialog.tsx` — pass `icon` in options
- `apps/web/src/routes/timeline/NewCardDialog.tsx` — pass `icon` in options
- `apps/web/src/routes/timeline/EditCardDialog.tsx` — pass `icon` in options

---

## Task 1: Enhance Select Component Field Display + Icon Sizing

**Files:**
- Modify: `packages/ui/src/components/Select/Select.tsx:171-212` (input field area)
- Modify: `packages/ui/src/components/Select/Select.tsx:282-314` (dropdown item rendering)

**Interfaces:**
- Consumes: `SelectOption` with optional `icon?: ReactNode` (already exists)
- Produces: No new exports — internal changes only

---

### Step 1a: Update input field to show icon when selected

The field currently displays only `selectedOption?.label` when closed. Add icon rendering:

At line 185, change the input value/display logic to render an icon + label inline when a selection exists.

**Current (line 185):**
```typescript
value={open ? query : (selectedOption?.label ?? "")}
```

This displays only the label text. We need to show an icon before it when `selectedOption` exists. However, the input `value` attribute can only be text, so we'll need to overlay the icon visually using absolute positioning, similar to the ChevronDownIcon pattern already in use.

Add a container div after the `<input>` (before ChevronDownIcon) that displays icon + label when closed and a selection exists:

```typescript
{!open && selectedOption?.icon ? (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute left-3.5 top-1/2 flex items-center gap-2 -translate-y-1/2"
  >
    <div className="flex-none rounded-[4px] overflow-hidden bg-[var(--lr-surface)]">
      {selectedOption.icon}
    </div>
    <span className="text-[.9375rem] text-[var(--lr-text)]">
      {selectedOption.label}
    </span>
  </div>
) : null}
```

Wait — we need to hide the input's text when this overlay is visible. Change the input's padding and opacity strategy instead. Better approach:

Actually, inspect the existing code more carefully. The input is showing text directly via its `value` prop. When we want to show an icon, we need to:
1. Keep the input's value as-is (the text)
2. Add padding-left to make room for the icon
3. Absolutely position the icon over the left side
4. Style the input text as transparent when icon is present

Here's the cleaner approach:

**Step 1a (revised): Create a wrapper that shows icon inline in the field**

When `selectedOption` exists and has an icon, render a small icon container before/inside the input field. The cleanest way is:
- Add CSS class to input when `selectedOption?.icon` exists: `pl-12` (more left padding) instead of `pl-3.5`
- Absolutely position the icon at `left-3.5` with the icon sized to 24px
- Icon gets its own styling separate from input

Modified input rendering (around line 171-204):

```typescript
<input
  // ... existing props ...
  className={[
    "w-full min-h-11 rounded-[var(--lr-r-md)]",
    // Conditional left padding when icon present
    selectedOption?.icon ? "pl-12" : "pl-3.5",
    "pr-9 text-[.9375rem]",
    // ... rest of existing classes ...
  ].join(" ")}
/>
{!open && selectedOption?.icon ? (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center"
  >
    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px]">
      {selectedOption.icon}
    </span>
  </div>
) : null}
```

- [ ] **Step 1b: Update dropdown icon sizing and add border-radius**

The dropdown icons currently render at 18px in line 306: `className="inline-flex h-[18px] w-[18px]..."`. Change to 24px and add wrapping div with border-radius:

At line 303-310, replace:
```typescript
{option.icon ? (
  <span
    aria-hidden="true"
    className="inline-flex h-[18px] w-[18px] flex-none text-[var(--lr-petrol-700)] dark:text-[var(--lr-petrol-300)] [&>svg]:h-full [&>svg]:w-full"
  >
    {option.icon}
  </span>
) : null}
```

With:
```typescript
{option.icon ? (
  <div
    aria-hidden="true"
    className="flex-none h-6 w-6 rounded-[4px] overflow-hidden flex items-center justify-center bg-[var(--lr-surface)] border border-[var(--lr-border)]"
  >
    <span className="inline-flex h-6 w-6 text-[var(--lr-petrol-700)] dark:text-[var(--lr-petrol-300)] [&>svg]:h-full [&>svg]:w-full">
      {option.icon}
    </span>
  </div>
) : null}
```

Wait, we don't want a border around logos — they're images, not SVG icons. If `option.icon` is an `<img>`, we don't need border/bg. Let me revise:

Actually, looking at how this will be used: `logoAsset` is a path string (e.g., `"ui-tokens/institutions/nubank.svg"`). When passed as `icon`, it will need to be rendered as an `<img>`. So in the dialogs, we'll pass `icon: <img src={i.logoAsset} alt="" />` or similar.

The icon container should just be:
```typescript
{option.icon ? (
  <div
    aria-hidden="true"
    className="flex-none h-6 w-6 rounded-[4px] overflow-hidden flex items-center justify-center flex-shrink-0"
  >
    {option.icon}
  </div>
) : null}
```

The `overflow-hidden` + `rounded-[4px]` will give us the rounded corners on the image automatically.

- [ ] **Step 2: Run typecheck to verify no regressions**

```bash
npm run typecheck
```

Expected: No new errors in `Select.tsx` or related files.

- [ ] **Step 3: Commit Select component changes**

```bash
git add packages/ui/src/components/Select/Select.tsx
git commit -m "feat: render institution icons in Select field + dropdown (24px, rounded 4px)"
```

---

## Task 2: Wire Logos in NewAccountDialog

**Files:**
- Modify: `apps/web/src/routes/timeline/NewAccountDialog.tsx:103-109` (institution selection)

**Interfaces:**
- Consumes: `InstitutionDto` with `logoAsset: string` (already available)
- Produces: `SelectOption[]` with `icon` field populated from `logoAsset`

---

- [ ] **Step 1: Update institution options to include icon**

At line 105, the current code:
```typescript
options={institutions.map((i) => ({ value: i.id, label: i.name }))}
```

Change to:
```typescript
options={institutions.map((i) => ({
  value: i.id,
  label: i.name,
  icon: i.logoAsset ? <img src={i.logoAsset} alt="" className="h-full w-full object-contain" /> : undefined,
}))}
```

This creates an `<img>` element for each institution's logo and passes it as the icon.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors in `NewAccountDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/timeline/NewAccountDialog.tsx
git commit -m "feat: show institution logos in account creation dialog"
```

---

## Task 3: Wire Logos in EditAccountDialog

**Files:**
- Modify: `apps/web/src/routes/timeline/EditAccountDialog.tsx` (find institution selection, if exists)

**Interfaces:**
- Consumes: `InstitutionDto` with `logoAsset`
- Produces: Same as Task 2

---

- [ ] **Step 1: Locate institution selection in EditAccountDialog**

Read the file and find where institutions are mapped to options:

```bash
grep -n "institutions.map" /home/bel/Projects/Fasolo/Lurem/lurem/apps/web/src/routes/timeline/EditAccountDialog.tsx
```

- [ ] **Step 2: Apply same icon transformation as NewAccountDialog**

Apply the same `.map()` transformation to include `icon: <img src={i.logoAsset} ... />`.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/timeline/EditAccountDialog.tsx
git commit -m "feat: show institution logos in account edit dialog"
```

---

## Task 4: Wire Logos in NewCardDialog

**Files:**
- Modify: `apps/web/src/routes/timeline/NewCardDialog.tsx` (institution selection)

**Interfaces:**
- Consumes: `InstitutionDto` with `logoAsset`
- Produces: Same as Task 2

---

- [ ] **Step 1: Locate institution selection and apply same transformation**

Find the `institutions.map()` call and apply the icon transformation.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/timeline/NewCardDialog.tsx
git commit -m "feat: show institution logos in card creation dialog"
```

---

## Task 5: Wire Logos in EditCardDialog

**Files:**
- Modify: `apps/web/src/routes/timeline/EditCardDialog.tsx` (institution selection)

**Interfaces:**
- Consumes: `InstitutionDto` with `logoAsset`
- Produces: Same as Task 2

---

- [ ] **Step 1: Locate institution selection and apply same transformation**

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/timeline/EditCardDialog.tsx
git commit -m "feat: show institution logos in card edit dialog"
```

---

## Task 6: Visual Verification + Final Checks

**Files:**
- Verify: `/run` dev server

---

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

or if using the project's custom runner:

```bash
/run
```

- [ ] **Step 2: Test account creation flow**

Navigate to the accounts section (or Timeline → "+ Adicionar contas"). Open the "Nova conta" dialog, select "Em instituição" and verify:
- Institution Select shows logos in the dropdown
- Selected institution shows logo + name in the field
- Logo is 24px, rounded corners visible
- Works in light and dark mode

- [ ] **Step 3: Test card creation flow**

Create a new card and verify the same behavior in card selection.

- [ ] **Step 4: Test edit flows**

Open an existing account/card and edit the institution — verify icon rendering.

- [ ] **Step 5: Run full typecheck**

```bash
npm run typecheck
```

Expected: All files clean, no new errors.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

or

```bash
biome check --apply apps/web/src/routes/timeline packages/ui/src/components/Select
```

Expected: No new linting issues introduced.

- [ ] **Step 7: Final commit (if any lint fixes applied)**

```bash
git add .
git commit -m "chore: lint and format institution-select-icons changes"
```

---

## Verification Checklist

✅ Logos render in dropdown when selecting institution  
✅ Logos render in field when institution is selected  
✅ Icon is 24px × 24px with `border-radius: 4px`  
✅ Works in light and dark color schemes  
✅ Responsive — no layout breaks on mobile  
✅ Accessible — icon is `aria-hidden`, label is text-based  
✅ Backward compatible — dialogs without logos still work  
✅ All files typecheck clean  
✅ Lint passes  

---

## Notes

- The `logoAsset` value is a relative path (e.g., `"ui-tokens/institutions/nubank.svg"`). The `<img src>` will resolve relative to the public assets directory, which is already configured in the dev/build setup.
- If any institution doesn't have a `logoAsset` (shouldn't happen in current seed, but defensively), passing `undefined` as icon is fine — Select handles it gracefully.
- The icon container's `overflow-hidden` class clips the image to the rounded corners automatically — no need for explicit image border-radius.
