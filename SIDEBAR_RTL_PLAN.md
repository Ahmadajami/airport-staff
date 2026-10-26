# Sidebar RTL plan

## Context

On `/ar/...` the sidebar must sit on the right and slide in from the right on mobile. Its spacing, rail, trigger icon and tooltips also need to mirror. This plan follows how `new-abq` handles it, and fixes a bug in the current `(dashboard)` layout.

## How new-abq does it

1. **`dir` on `<html>`.** `src/app.html` has `<html lang="%paraglide.lang%" dir="%paraglide.dir%">`, and `hooks.server.ts` replaces it with `getTextDirection(locale)`. Airport-Staff already does the same thing.
2. **On desktop, `side="left"` means "start".** The desktop container in `ui/sidebar/sidebar.svelte` uses logical insets: `data-[side=left]:inset-s-0`, `data-[side=left]:group-data-[collapsible=offcanvas]:-inset-s-(--sidebar-width)`, and the `data-[side=right]` equivalents with `inset-e`. Under `dir="rtl"`, the default `side="left"` sidebar therefore lands on the **right** with no prop at all.
3. **On mobile, the side is physical.** The mobile sidebar is a `Sheet`, and `sheet-content.svelte` uses physical `left-0` / `right-0` / `slide-in-from-left`. So `AppSidebar.svelte` passes a side **only on mobile**:
   ```ts
   const sidebar = Sidebar.useSidebar();
   const side = $derived(sidebar.isMobile ? (isAr ? 'right' : 'left') : undefined);
   ```
   ```svelte
   <Sidebar.Root {side} ...>
   ```
4. **Icons.** The arrow icons use `rtl:rotate-180`. The trigger icon has `class="cn-rtl-flip"`, but no CSS defines that class in either project or in `shadcn-svelte/tailwind.css`, so it does nothing.

Some things new-abq leaves physical and never fixes: `sidebar-inset` (`ml-0`), `sidebar-rail` (`-right-4`/`left-0`), `menu-button` (`text-left`, `pr-8`), `menu-action`/`menu-badge`/`group-action` (`right-*`), `menu-sub` (`border-l`), and the collapsed-tooltip `side="right"`. new-abq uses the default `variant="sidebar"` with `collapsible="icon"`, so `inset` margins never mattered there.

## Current state in Airport-Staff

- `ui/sidebar/sidebar.svelte` already uses logical `start-0` / `end-0`, the same idea with older syntax. So point 2 works here too.
- **Bug:** `src/routes/(dashboard)/+layout.svelte` passes `side="right"` for RTL on desktop. The container then gets `data-[side=right]:end-0`, and in RTL `end` is **left**. The Arabic desktop sidebar renders on the wrong side, which the SSR output confirms (`data-side="right"`).
- We use `variant="inset"`. `sidebar-inset.svelte` has `md:peer-data-[variant=inset]:ml-0` and `peer-data-[state=collapsed]:ml-2`, so in RTL the inset panel loses its margin on the wrong edge.
- `sidebar-trigger.svelte` uses `class="cn-rtl-flip"`, which has the same no-op problem as in new-abq.

## Steps

### 1. Adopt new-abq's side logic (fixes the bug)

- `src/routes/(dashboard)/+layout.svelte`: remove the `getLocale`/`getTextDirection` import, the `side` const and `{side}`. Render `<AppSidebar variant="inset" />`.
- `src/lib/app/layout/AppSidebar.svelte`: add the following, and pass `{side}` to `Sidebar.Root` **after** `{...restProps}` so callers can't override it by accident:
  ```ts
  const sidebar = Sidebar.useSidebar();
  // Desktop: `left` is the logical start, so it mirrors under dir="rtl" on its own.
  // Mobile: the Sheet uses physical sides, so pick one from the text direction.
  const rtl = getTextDirection(getLocale()) === 'rtl';
  const side = $derived(sidebar.isMobile ? (rtl ? 'right' : 'left') : undefined);
  ```
  - Use `getTextDirection` rather than `locale === 'ar'`, so a future RTL locale works without code changes.
  - Calling `useSidebar()` inside `AppSidebar` is safe because it renders inside `Sidebar.Provider`.
  - `isMobile` is `false` during SSR, so the server renders the desktop markup. The client switches to the Sheet after hydration, the same as new-abq.

### 2. Make the generated sidebar primitives logical (beyond new-abq)

CLAUDE.md §6.5 forbids physical utilities. These are small class-string swaps in `src/lib/components/ui/sidebar/`, and they don't change behavior in LTR:

| File | Change |
| --- | --- |
| `sidebar-inset.svelte` | `md:peer-data-[variant=inset]:ml-0` → `ms-0`; `…peer-data-[state=collapsed]:ml-2` → `ms-2` **(needed: we use `inset`)** |
| `sidebar-trigger.svelte` | `cn-rtl-flip` → `rtl:-scale-x-100` so the panel icon points the right way |
| `sidebar-menu-button.svelte` | `text-left` → `text-start`; `group-has-data-[sidebar=menu-action]/menu-item:pr-8` → `pe-8`; tooltip `side="right"` → `side={dir === 'rtl' ? 'left' : 'right'}` (bits-ui floating sides are physical) |
| `sidebar-rail.svelte` | `group-data-[side=left]:-right-4` → `-end-4`; `group-data-[side=right]:left-0` → `start-0`; `[[data-side=left][data-collapsible=offcanvas]_&]:-right-2` → `-end-2` (and the `-left-2` equivalent → `-start-2`); `after:left-full` → `after:start-full`; swap `cursor-w-resize`/`cursor-e-resize` under `rtl:` |
| `sidebar-menu-action.svelte`, `sidebar-menu-badge.svelte` | `right-1` → `end-1` |
| `sidebar-group-action.svelte` | `right-3` → `end-3` |
| `sidebar-menu-sub.svelte` | `border-l` → `border-s`; `translate-x-px` → `translate-x-px rtl:-translate-x-px` |

Notes:
- `group-data-[side=right]:rotate-180` on `sidebar-gap` stays. It never shows because we always use `left`/start on desktop.
- Leave `sheet-content.svelte` physical. Step 1 already gives it the correct physical side.
- Re-running `pnpm dlx shadcn-svelte add sidebar` would overwrite these edits. Add a one-line comment at the top of each edited file (`<!-- RTL: logical utilities, see SIDEBAR_RTL_PLAN.md -->`) so the next regeneration is a conscious choice.

### 3. Nothing else needed

- `SiteHeader.svelte` already uses `-ms-1` / `ms-auto`.
- `NavMain.svelte` has no direction-specific classes.
- The brand icon in `AppSidebar.svelte` already has `rtl:-scale-x-100`.

## Verification

1. Run `svelte-autofixer` on every edited `.svelte` file. Run `pnpm check`, and `pnpm prettier --check` on the edited files.
2. SSR check: on `/ar/employees`, `curl` should find no `data-side="right"` on the desktop sidebar. On `/employees` it should still be `data-side="left"`.
3. In the browser, at desktop width:
   - `/ar/employees`: the sidebar is on the right, and the inset panel has an even margin on both edges.
   - Collapse with the trigger: the sidebar slides off to the right, and the trigger icon mirrors.
   - Check `/employees` the same way for LTR.
4. Mobile width (< 768px): on `/ar/...` the Sheet slides in from the right, and on `/...` from the left.
5. If `collapsible="icon"` is enabled later: the collapsed-item tooltips open toward the content (left in RTL).
