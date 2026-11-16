# Contract: protocol conformance, revision 2026-07-28

Every row is exercised through the mounted route, `POST /api/mcp` on a local-mode server, by the
protocol reference client and by raw requests, and again in the release acceptance run with Codex
CLI. A row passes only when the answer's status, error code and body match. "Library" means the
behaviour comes from `@modelcontextprotocol/server` 2.4.0 and the test proves it still does on the
pinned version; "route" means this feature adds it in front of the library.

Rows marked "checked" were observed on 2026-11-16 in a scratch project under Bun 1.4.0 (see
research.md D2); the others follow the specification pages named in the reviews.

| # | Requirement | Expected answer | Source | Test |
|---|-------------|-----------------|--------|------|
| C1 | `server/discover` is answered | 200, supported versions, capabilities with `tools` only, no `resources` or `prompts` | library, checked | `tests/mcp/conformance.test.ts` |
| C2 | Every request carries `MCP-Protocol-Version`, `Mcp-Method` and, for `tools/call`, `Mcp-Name`; a missing header is refused | 400, JSON-RPC -32020 | library, checked | same |
| C3 | A header that disagrees with the body is refused | 400, -32020 | library, checked | same |
| C4 | An unsupported revision is refused | 400, -32022, `data.supported` lists `2026-07-28` | library, checked | same |
| C5 | An unknown method is refused | 404, -32601 | library, checked | same |
| C6 | A body without the client envelope is refused | 400, -32602 | library, checked | same |
| C7 | Every result carries its result type; list results carry `ttlMs` and `cacheScope: private` | present on `server/discover`, `tools/list` and every `tools/call` result | library, checked | same |
| C8 | `tools/list` is in a fixed order | sorted by name, byte for byte equal across calls | route | same |
| C9 | `GET` and `DELETE` are not served | 405 | library, checked | same |
| C10 | A notification is acknowledged | 202 and no body | library, to check | same |
| C11 | Closing the response cancels the call | no write is half applied; a read stops | route | `tests/mcp/cancellation.test.ts` |
| C12 | A tool input that fails its schema is a tool error | `isError: true`, code `invalid_input` naming the field | library plus route, checked | `tests/mcp/tool-errors.test.ts` |
| C13 | The tool that runs is the tool named in the body | a request whose `Mcp-Name` names a read tool while the body names a write tool is refused before dispatch | library plus route | `tests/mcp/header-body-agreement.test.ts` |
| C14 | A 2025-era `initialize` and `tools/list` and `tools/call` are served request and response from the same definitions | 200 with an event-stream or JSON body; `GET` and `DELETE` 405; no change notices offered | library, checked for `initialize` | `tests/mcp/legacy-era.test.ts` |
| C15 | Tool annotations equal the contract table | the four hints per tool match [mcp-tools.md](./mcp-tools.md) | route | `tests/mcp/tool-contract.test.ts` |
| C16 | No `resources`, `prompts` or `subscriptions/listen` | `resources/list` and `prompts/list` answer 404 -32601; `subscriptions/listen` answers 404 -32601 | route | same as C1 |
| C17 | Private list caching | a list for one caller is never marked shareable | library, checked | same as C7 |
| C18 | Request limits | body over the global cap is refused before parsing (413); over the per-tool cap once the name is known | route | `tests/mcp/body-caps.test.ts` |
| C19 | Rate and concurrency limits | an excess answers a tool error `rate_limited` with `retryAfterSeconds` | route | `tests/mcp/limits.test.ts` |

## Client matrix

| Client | What is tested | Recorded in the acceptance record |
|--------|----------------|-----------------------------------|
| Protocol reference client (`@modelcontextprotocol/client` 2.4.0, development dependency) | all rows above; the bridge and the direct form | exact version |
| Codex CLI | connection through the bridge and through the direct form, list, one read, one validated save, one commit | exact version and the configuration used |

No other client has a compatibility promise. A client of the earlier protocol era gets request and
response through the library's stateless fallback and nothing else.
