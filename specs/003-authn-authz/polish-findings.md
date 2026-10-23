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

## Governed metrics and classifications

| Where | Finding | Status |
| --- | --- | --- |
| Metric detail, Approve and Deprecate, all widths | A disabled button gave its reason only as a tooltip, which a touch screen never shows. | fixed: the reason ("Requires Steward.", "You own this metric; another Steward decides.") is written beside the button; browser check asserts the text for an Editor and for the metric's owner |
| Metric detail, Deprecate form, 390 px | The reason field was narrower than the row, and the outcome of the approval before it ("Approved.") floated beside the new form. | fixed: the form takes the whole row and the old outcome is cleared when the form opens; browser check asserts both |
| Metric wizard, owner step, all widths | The owner field looked like a plain text box; nothing said that people are suggested. | fixed: a line under the field says who the suggestions are; browser check asserts the suggested names and screenshots the step |
| Metric detail, unverified owner badge, all widths | The badge is readable and wraps under the address at 390 px. | no change |
| Contract properties as an Editor, all widths | Protected properties and classifications were read-only with no explanation. | fixed: a sentence above the table says who may change them; browser check asserts it |
| Source editor, refused classification edit, all widths | The message read "Not saved: Refused: this would include…" and the end said "needs Steward in this project's domain, or Admin", which is not a sentence. | fixed: the label drops the repeated prefix and the refusal says "needs Steward access in this project's domain, or Admin access"; unit tests cover both and the browser check asserts the shown sentence |
| Sidebar, server mode, all widths | The count "N files you cannot open" was drawn larger than the file rows, and the footer said the folders are on this machine. | fixed: row-sized line, and "on the server" with a note that changes stay in the person's own working copy until published; browser check asserts both |
| Sidebar footer, 1280×720 | With three projects open the footer note sits below the visible part of the sidebar and is reached by scrolling it. | no change: the sidebar already scrolls and the note is secondary |

## Working copies and publishing (Source Control)

| Where | Finding | Status |
| --- | --- | --- |
| Source Control as an Editor, all widths | Publish to main was disabled with a tooltip only. | fixed: "Requires Steward to publish to main." under the buttons; two-editors check asserts it |
| Source Control, all widths | Buttons that carry the `hidden` attribute (Push main for people who may not push) were still drawn, because the page's button rule overrides it. | fixed: one rule keeps hidden elements hidden; two-editors check asserts Push main and Remote… are hidden for a Steward and an Editor |
| History, Editor with hidden commits | "1 commits with changes you cannot open". | fixed: singular and plural; unit test |
| Branch picker, all widths | Another person's work branch is no longer offered at all. A branch another copy holds is listed with its holder ("feature/frank (in use by Frank Freitas)") and disabled. | no layout defect: the check asserts the option and keeps the closed picker's geometry at four widths; a headless screenshot cannot draw the open list |
| Source Control, 2560 px | The panel keeps its 340 px column and leaves the wide diff area empty until a file is chosen. | no change: existing layout, and the diff fills that area |

## Connected accounts, connect prompt and the pages outside the workspace

| Where | Finding | Status |
| --- | --- | --- |
| Connected accounts dialog and connect prompt, all widths | Readable and inside the viewport; buttons and the dismiss control keep their size. | no change |
| Sign-in error page, all widths | The reason ("Expired or replayed sign-in attempt") had no full stop, unlike the other pages. | fixed: every reason ends with one; unit test |
| Signed out page, all widths | Readable; the button is reachable at every width. | no change |
| Front-channel logout | It answers an empty 200 for the provider and has no page to capture. | not applicable |

## Admin panel, second pass

| Where | Finding | Status |
| --- | --- | --- |
| Users & groups, refusing to deactivate the last Admin | The message read "Deactivate Dave Dias: last-admin: deactivated: this change would remove…", with the internal area name in it. | fixed: the server sentence no longer carries the area name; unit test |
| Projects, 1280 px and wider | The domain name fields ended at different edges, because each Remove button was as wide as its domain id. | fixed: the button reads "Remove" (its accessible name still names the domain); browser check asserts one right edge |
