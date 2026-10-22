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

## Admin panel

| Where | Finding | Status |
| --- | --- | --- |
| Every Admin dialog, all widths | Buttons inside the dialog body (History, Add grant, Dry run, Remove domain…) use the page's 16 px button size, larger than the footer's Close button and the Grants/Roles switch beside them. | fixed: body buttons use the footer's 13 px size and 32 px height |
| Policies and Roles, all widths | Edit and Delete sit against each other with no space between them. | fixed: 8 px between neighbouring buttons in a section |
| Role editor, all widths | The 36 action checkboxes stand one per line about 45 px apart, so the form is several screens tall and the conditions are far from the actions. | fixed: actions in columns within each group; an action with open conditions takes the whole row |
| Audit, 1280 px and wider | The six filters stand in one column of full-width fields, pushing the records below the fold. | fixed: filters in a grid of columns aligned on their fields; one column on phones |
| Projects, 1280 px and wider | Each domain takes three lines (ID, name field, Remove button), and the new-domain fields stack the same way. | fixed: label, field and button on one row that wraps on phones |
| Settings, all widths | The idle and absolute hour fields stretch across the whole dialog for a two-digit number. | fixed: number fields are at most 160 px wide |
| Policies, all widths | Baseline rules without a description end in a dangling "·", in a larger type than the rest of the list. | fixed: the separator only appears with a description; summaries use 13 px |
| Roles & access grants table, 390 px | Group names read "name not resolved" while their lookup is still running. | fixed: the table shows the name the grants response already carries; the grant form says "looking up name…" while it waits |
| Refusals in every dialog | The red message repeats the request (`POST /api/admin/users/…%3A…/deactivate`) before the reason. | fixed: dialogs show only the refusal code and sentence, plus a note when a bootstrap Admin can still restore access |
| Audit, all widths | Read decisions end in "deny ·" because they record no outcome. | fixed: the outcome only appears when recorded |
