# Contract: consent page, scopes and the setup-credential page

## Scope table

| Scope | Effects | Consent wording (plain English) | Default |
| --- | --- | --- | --- |
| read | read | Read definitions, findings, history and published context you may read. | on |
| validate | read | Check proposed text without saving it. | on |
| edit | localWrite | Create, change and delete files in your own working copy, as you. Nothing is published. | on |
| commit | commit | Commit the files it names to your working branch, with your name as author. | on |
| remote | remote, credential | Use your Git credential held by this server to fetch, pull and push. | off |
| publish | publish | Move the published branch that every consumer reads. | off |
| administration | administration | Not available in this release. | not offered |

No scope reaches permanent purge or destruction of a workspace or history. A scope never gives more
than the person's roles: it narrows them.

## Consent page content, in order

1. The product name and "Connect an agent".
2. The program name and description, and who is signing in ("as Maria Costa, with your roles").
3. The scopes, each with its wording and a checkbox; defaults on; scopes the person's roles can
   never use shown unchecked, disabled, with "Your roles do not allow this".
4. A sentence: "This connection ends when you sign out or your session expires, which can be as
   soon as the end of the day."
5. The sentence of the decisions file, unchanged: "Semantic Workbench does not call a language
   model. When you connect an external agent, that agent can receive definitions you authorize and
   may send them to its model provider; its configuration and policies govern that onward use."
6. When `remote` is checked (shown for everyone, but with its own warning line): "The agent can push
   with your Git credential."
7. Buttons **Allow** and **Deny**; the program's setup note when present.

All text wraps; nothing is cut. At 320 CSS pixels wide the page is one column and the buttons stack.

## Setup-credential flow

`GET /oauth/setup` (browser session): choose the program (only registered ones) and scopes, same
text as above. `POST /oauth/setup` creates the credential and answers `200` with a page that shows
it once (`Cache-Control: no-store`, no address carries it), its expiry, the command for the bridge
with the credential field masked as a placeholder and the server address filled in, and the same
reminder that the connection ends with the browser session. Reloading shows the form again.

## Error page

One page for every refusal before consent (unknown program, bad redirect, stale post, limit
reached): the product name, one sentence from a closed list, and a link to the workbench. It never
names the cause beyond that list, and it does not echo request parameters.

## Headers (all pages)

`Cache-Control: no-store`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`,
`Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self' <registered
redirect origin>; frame-ancestors 'none'`. No script.

## Visual design

Same tokens as the sign-in pages (`src/shared/theme/theme.css` through `auth-stylesheet.ts`): the
centred card, brand mark, `h1` and body sizes, buttons with the same border and hover as the
sign-in buttons; the primary button uses the accent token. Light and dark follow the system
setting. Disabled scope rows use the muted text token and keep at least 4.5:1 contrast.
