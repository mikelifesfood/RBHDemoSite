# RBH Safety — Design System v2.0 (2026-10-03)

Visual redesign of the employee report form (`index.html`) and the management dashboard (`dashboard.html`).
Presentation only: no database, SQL, Edge Function or workflow changes. Every element ID and every line of dashboard JavaScript is unchanged.

## Deployment

1. Upload `index.html` and `dashboard.html` to GitHub (replace the existing files).
2. No SQL. No Edge Function changes. Order does not matter.
3. `platform/index.html` was not changed.

## What changed

**Both pages**
- One typeface: Archivo (variable width). Condensed heavy for headings and numbers, normal width for everything else. Public Sans is no longer loaded.
- Gradients removed. Flat red, black and white with hairline borders.
- All colors come from one token block at the top of each `<style>`.
- Smallest text raised from 10–11px to 12–12.5px. Muted text meets WCAG AA contrast.
- Visible keyboard focus ring everywhere. Reduced-motion respected.

**Report form**
- Black hero panel with the title, the three "Fast / Anonymous / Jobsite ready" facts, and a red bottom edge.
- Sections are numbered 1–7 (the form is a sequence).
- Section order: What → Was anyone hurt → Where & when → What happened → Response → Photos → Your info. "Your info" moved from first to last so people start with the report itself.
- The duplicate "Speak up early" intro card was removed (its text keys `intro_eye`, `intro_h`, `intro_p` are still in the dictionary, unused).
- Severity is a connected scale whose color climbs from gray to red.
- Copy tweaks in the dictionary only: `title_h1` is sentence case; `dash_opt` is "optional" / "opcional" (shown as a small pill).

**Dashboard**
- Black sidebar with a reversed (white) crop of the logo. The login screen uses the cropped logo without phone numbers.
- Stat strips, inbox, task lists, user lists and history are ruled lists inside one panel instead of stacks of separate cards. A 4px left rule carries state: red = injury, amber = overdue, black = open, gray = closed.
- Workflow track: flat segments. Green = done, black = current step, red = blocked, gray = not yet.
- Notification bell stays red (Step 11A). Panel now opens below the top bar instead of over the bell.
- Empty placeholders in the incident workspace no longer leave a large gap above the step panel.

## Color meaning

| Token | Hex | Means |
|---|---|---|
| `--brand` | #A1182C | Brand (sampled from the logo), primary buttons, injury, urgent |
| `--chrome` | #000000 | Sidebar, hero bands, current step, workflow buttons |
| `--ink` | #18181B | Body text |
| `--muted` | #62626A | Secondary text |
| `--canvas` | #F4F4F5 | Page background |
| `--ok` | #17784A | Done / verified only |
| `--warn` | #9A5A00 | Waiting / due soon / overdue only |

Buttons: red filled = brand primary (sign in, submit, add, confirm). Black filled = move the workflow forward or produce output (Complete step, Download PDF). White outlined = secondary.

## White-label (future customers)

1. In both files, edit only the `/* BRAND */` block at the top of `<style>`: `--brand`, `--brand-hover`, `--brand-tint`, `--brand-line`, `--brand-on-dark`, `--chrome`.
2. Replace the logo images: full logo in `index.html` (`#brandLogo`), cropped logo on the dashboard login, reversed logo in the dashboard sidebar.
3. Replace RBH-specific copy (company name, address, license, phone) in the markup and the form's i18n dictionary.

## Known issues found during review (not fixed; logic, out of scope)

1. `dashboard.html` → `renderMyWork()` calls `myWorkCard(...)`, which is not defined. When the signed-in user is the investigator on an open report in Steps 1–3, My Work throws and the report list falls back to "Couldn't load reports."
2. `dashboard.html` → `loadNotes()` references `actionAudits`, which only exists inside another function. Any report that has notes shows "Couldn't load notes." in the incident workspace.
