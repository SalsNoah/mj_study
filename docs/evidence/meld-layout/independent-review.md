# Independent review — meld order and added-kan layout

Reviewer: independent_review agent (not implementation author), 2026-10-07 UTC.
Base: 6dc0593e897370355182758e7334a8c7e52cf785; working branch fix/meld-order-added-kan.

## Result

No blocking issue found in the reviewed production diff. Final aggregate tests and real-browser behavior run are owned by the implementation agent; the results below are the checks independently performed by this reviewer.

## Code and data preservation

- Existing editor appends melds; it does not sort melds by tile type. HandView previously displayed that array left to right. Copying and reversing only the outer array now places earliest insertion on the right without mutating the stored array or individual meld tiles.
- Chi tile order, calledIndex, addedIndex and source direction are unchanged by rendering. Current production HandView callers all use tight layout.
- Pon promotion replaces the existing entry via map, preserving array slot, ID, from, calledIndex and original three tile values; appends only the selected fourth tile. Four-meld limit is bypassed only for a matching existing pon; physical supply/red-five checks still apply. Undo restores the original meld array.
- No persistence schema/migration, backup, accepted-discard, ukeire algorithm, context, attachments, tag or study-history code changed. Legacy arrays are interpreted consistently in their existing array order. An original chronological order absent from old data cannot be recovered and must not be claimed to have been recovered; reversing a display copy leaves that data recoverable.
- Non-tight flex wrapping was investigated: no current production caller uses that mode, so its multi-line layout is not a blocker for this request.

## Independent image and geometry review

Directly opened every before and after hand crop with view_image: 320/390/1440 widths × normal/cool/cute/dopa/moe = 15 matched conditions, each containing left/opposite/right added kan and a chi. Also directly opened all 15 after full viewport screenshots. These are local Chromium screenshots, not physical iPhone/Android validation or production deployment evidence.

Before: horizontal tiles occupy square flex boxes because the horizontal row width flex-basis applies as height inside the column stack. At 320px normal, a horizontal tile is 17.578125 × 17.578125 despite its 90:66 image ratio. The excess box height makes the upper image appear suspended. Transform was none, not a rotation-origin defect.

After: the stack-child flex override and explicit height restore 17.578125 × 12.890625 at the same viewport. Both stacked horizontal tiles have matching width, meet edge-to-edge, and the lower tile aligns with adjacent upright tile bottoms. All three source directions remain recognizable; chi internal order is unchanged. Five themes remain intact. No new clipping, overlap or horizontal page overflow was found. At 320px the melds remain small due to the existing board sizing, but the separation defect is removed.

Independently recomputed from both geometry JSON files (not relying on the capture script assertions):

- 15 after screens, 45 added-kan stacks.
- Maximum upper/lower edge gap: 0 px.
- Maximum base alignment error: 0 px.
- Maximum horizontal width/height ratio error from 90/66: 0.0005199757344658273 (fractional CSS pixel rounding).
- No overlapping neighboring meld bounding boxes or document overflow.

Evidence: before/ and after/ PNGs and geometry.json in this directory. The before/after scripts use the same synthetic hand, viewport and theme conditions; only the requested order and layout changes differ.

## Independent verification

Ran `npm test -- src/components/HandView.test.tsx src/components/TileLimit.test.tsx src/domain/melds.test.ts src/domain/ukeire.test.ts src/storage/repository.test.ts` on the changed working tree: 5 files, 83 tests passed (07:24 UTC, 1.74s). Tests cover reversed copy/inner order and nonmutation, four-meld pon upgrade/undo/source/red retention/save, physical supply, meld construction, ukeire and repository regression. `git diff --check` passed.

No production code or test implementation was edited by this reviewer. No publishing, GitHub operation or deployment was performed.
