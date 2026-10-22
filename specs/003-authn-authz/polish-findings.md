# Polish findings

Findings from the screenshots taken at 390×844, 1280×720, 1440×900 and 2560×1440 during each user
interface phase. Each entry says where it shows, what is wrong and what was done.

## Sign-in (person menu and the pages outside the workspace)

| Where | Finding | Status |
| --- | --- | --- |
| Person menu, all widths | Name, address and role are drawn as greyed, disabled menu items, each with the same "Signed-in identity" hint, and centred. They read as unavailable actions instead of who is signed in. | fixed: non-focusable left-aligned identity header above the actions; geometry and menu semantics asserted in the browser check |
| Header, 390 px | The person menu button wraps onto a second header row of its own, costing about 50 px of height. | fixed: dedicated first-row grid cell and icon-only narrow button; browser check asserts alignment at 390 px |
| Sidebar, server mode | The sidebar still says "Local workspace" when the workbench runs in server mode. | fixed: Shared workspace in server mode; Local workspace unchanged; browser assertion added |
| No access, Signed out, Sign-in error | The pages are readable at every width. The "An Admin must grant you access" sentence has no full stop, and the button uses the browser's default style rather than the workbench's. | fixed: full stop and shared auth stylesheet button/link styling; auth page tests cover markup and styles |
