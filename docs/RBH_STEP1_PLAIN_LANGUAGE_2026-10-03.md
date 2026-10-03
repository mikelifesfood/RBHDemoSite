# Step 1 — Plain language + form clean-up (2026-10-03)

Text and layout only. No SQL, no Edge Function changes, no change to what the form sends or what the dashboard saves.

## Deploy

Replace `index.html` and `dashboard.html` in GitHub. Order does not matter.

## Dashboard wording (screen text only)

| Old term | New term on screen |
|---|---|
| Corrective action(s) | Fix / fixes ("Fix #1") |
| Corrective Actions (menu) | Fixes |
| Status "Corrective action" | Fix in progress |
| Status "Closed — no action" | Closed — no fix needed |
| Verify / verification | Approve / approval ("Send for approval", "Approve fix") |
| Verification owner / verifier | Approver |
| Investigator / case owner | Case owner |
| Investigation (Step 2) | Find the cause |
| Root cause | Why did it happen? |
| Action Plan (Step 3) | Plan the fix |
| Complete Action (Step 4) | Do the fix |
| Verify (Step 5) | Check the fix |
| Control type | Type of fix: Remove the hazard / Swap for something safer / Guard or barrier / New rule or training / Safety gear (PPE) |
| Regulatory screening | Cal/OSHA question ("Does this need to be reported to Cal/OSHA?") |
| Evidence | Photos or files |
| Restart workflow | Start steps over |
| Reopen record | Reopen report |

Kept formal on purpose:
- The PDF and CSV exports still use the standard terms (corrective action, root cause, verification), because insurers and inspectors expect them. Control types now read "Guard or barrier (engineering control)", so both terms appear.
- The Cal/OSHA timer banner and the California notice at the bottom of each page keep their exact legal wording.
- Brevo emails (Edge Function) still use the old terms. Updating them is a separate step because it needs an Edge Function deploy.

Layout:
- "Start steps over" and "Reopen report" moved into a "More options" menu next to Download PDF, so they aren't clicked by accident. The menu only appears when one of them is available.
- Example answers were added as placeholders for "Why did it happen?" and "What will be fixed?".

## Report form

- Section order: 1 What → 2 Was anyone hurt → 3 Where & when → 4 What happened → 5 Photos → 6 More details → 7 Your info.
- **Hazard type** is now 12 picture tiles instead of a dropdown. The tile writes the same value into the same hidden `hazard` field, so `hazard_category` in the database is unchanged.
- **More details** (collapsed, optional) holds: specific spot, who was involved, what was done right away, and ideas to fix it. Same field IDs and same saved values as before.
- Description hint now tells people they can tap the keyboard microphone to talk, with an example placeholder.
- Shorter, plainer good-faith reporting note at the bottom (still cites Labor Code §6310).
- Fixed: the small "optional" label never switched to Spanish ("opcional").
- English and Spanish updated together.

One small script was added at the end of `index.html` to copy the chosen hazard tile into the hidden field and clear it when "Submit another report" is used. The existing form script is unchanged apart from dictionary text.
