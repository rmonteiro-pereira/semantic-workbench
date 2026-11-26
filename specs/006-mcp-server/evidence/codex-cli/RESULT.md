# Codex CLI stdio acceptance

Status: PASS on 2026-11-26 in the rerun below (Codex CLI with its normal sign-in, run outside the job sandbox).
The first attempts, kept after the rerun, failed at nested model startup because the sandboxed client had no sign-in.
Version: `codex-cli 0.169.1`.

## Server and preparation

Working directory: `/home/rodrigo/projetos/semantic-workbench-wt/021-docs`.
API command: `bun src/server/index.ts` (the API child used by `bun run dev`; no Vite process).
Environment:

```sh
DATA_DIR=/home/rodrigo/scratch/sw-docs/p3/local-data
SW_PORT=5451
TMPDIR=/home/rodrigo/scratch/sw-docs/p3/tmp
XDG_CACHE_HOME=/home/rodrigo/scratch/sw-docs/p3/cache
GIT_CONFIG_GLOBAL=/home/rodrigo/scratch/sw-docs/p3/gitconfig
GIT_CONFIG_NOSYSTEM=1
```

The scratch Git configuration supplies an isolated test identity.
Preparation HTTP requests, using JSON content type and `Sec-Fetch-Site: same-origin`:

```sh
curl http://127.0.0.1:5451/readyz
curl -X POST -H 'Content-Type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{}' http://127.0.0.1:5451/api/examples/mapped-commerce
curl -X POST -H 'Content-Type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{}' http://127.0.0.1:5451/api/projects/mapped-commerce/git/publish
```

The actual helper sends these equivalent requests with Python urllib. Load returned
`created: true`, four imported files, commit `75f925c34b5a974440c79e959b4e4dcd4b4b7c87`.
Publish returned `published: main` at that commit. A repeat publish returned 409;
subsequent attempts retained the existing published snapshot.
All preparation changes are confined to the disposable data repository.

## Client configuration and command

Help inspected: `codex exec --help`, `codex mcp add --help`.
The three MCP overrides were identical in every attempt:

```sh
-c 'mcp_servers.sw_accept.command="bun"'
-c 'mcp_servers.sw_accept.args=["scripts/mcp-stdio.ts"]'
-c 'mcp_servers.sw_accept.env={DATA_DIR="/home/rodrigo/scratch/sw-docs/p3/local-data",SW_PORT="5451"}'
```

The first attempt used the default Codex home with `--ignore-user-config --ignore-rules --json`,
the MCP overrides above, the working directory, workspace-write sandbox, and output file below.
It exited 1: `failed to initialize in-process app-server client: Read-only file system (os error 30)`.
A second attempt added the scratch sqlite/log overrides and disabled shell snapshots;
it produced no JSON session events and exited 1. Its empty original log is retained separately.
The watchdog log was temporarily used as a termination control and restored from that original;
no synthetic events are counted as model calls.

Final attempt: `CODEX_HOME=/home/rodrigo/scratch/sw-docs/p3/nested-home`, initially empty,
plus the scratch environment above. Exact argv, including task:

```sh
codex \
  exec \
  --ignore-user-config \
  --ignore-rules \
  -c \
  'sqlite_home="/home/rodrigo/scratch/sw-docs/p3/sqlite"' \
  -c \
  'log_dir="/home/rodrigo/scratch/sw-docs/p3/codex-logs"' \
  -c \
  features.shell_snapshot=false \
  --json \
  -C \
  /home/rodrigo/projetos/semantic-workbench-wt/021-docs \
  -s \
  workspace-write \
  -c \
  'mcp_servers.sw_accept.command="bun"' \
  -c \
  'mcp_servers.sw_accept.args=["scripts/mcp-stdio.ts"]' \
  -c \
  'mcp_servers.sw_accept.env={DATA_DIR="/home/rodrigo/scratch/sw-docs/p3/local-data",SW_PORT="5451"}' \
  -o \
  /home/rodrigo/scratch/sw-docs/p3/nested-final.txt \
  'Use only sw_accept MCP tools. No shell, other tools, filesystem access, subagents or browsers. Do not read instructions. At most 35 model turns. Acceptance: enumerate the sw_accept tools available to you; list files of mapped-commerce; read commerce.mapped-semantic.yaml; validate its full text with exactly one new leading YAML comment "# Acceptance review complete"; save that one-line edit with baseVersion; get branch/head as needed and git_commit only that file using its saved version, expectedBranch, expectedHead, a unique idempotencyKey, message "Review commerce definitions". This commit is authorized only inside the disposable workbench data repository through MCP, never in the source checkout. Finally get_mapping_catalog for mapped-commerce (already published). Summarize each step pass/fail and answers. Do not publish. Never expose capability or credentials.'
```

The monitor limits the nested session to 40 turn-start events and, in the final attempt,
60 seconds. The task separately limits itself to 35 model turns. The final attempt recorded
one turn start and no completed model response or MCP tool invocation. Transport retries
returned 401 over WebSocket and HTTPS: `Missing bearer or basic authentication in header`.
It exited 1 before the watchdog deadline. No credentials were copied into the empty home.
All attempts also warned that untrusted project-local configuration was disabled.
No trust setting was persisted.

## Step results

| Step | Result | Answer summary |
| --- | --- | --- |
| Record version | PASS | codex-cli 0.169.1 |
| Start isolated local API | PASS | Ready on 5451 |
| Load Mapped commerce | PASS | Four files imported |
| Prepare published catalog | PASS | Main snapshot established through preparation HTTP request |
| Discover/list MCP tools | FAIL, blocked | No completed nested tool call |
| List mapped-commerce files | FAIL, blocked | No tool answer |
| Read one file | FAIL, blocked | No tool answer |
| Validate one-line comment edit | FAIL, blocked | No tool answer |
| Save edit | FAIL, blocked | No tool answer; no nested edit |
| Commit edit with message | FAIL, blocked | No tool answer; no nested commit |
| Read published catalog through MCP | FAIL, blocked | No tool answer |
| Stop local servers | PASS | All three API attempts exited 0 after exact-PID SIGTERM |

Nested session final message: none; the output-last-message file is empty.
This result does not identify a bridge protocol failure: the model session never completed startup.

Raw evidence remains under `/home/rodrigo/scratch/sw-docs/p3/`:
`run.log`, `retry.log`, `final-attempt.log`, `nested-command.json`, `nested.jsonl`,
`nested-retry-original.jsonl`, `nested-stderr.log`, `nested-final.txt`, and `local-server.log`.
Later attempts overwrite the shared client/server logs; the three run logs preserve lifecycle results.
PIDs are namespace-local: initial API 6, first nested 121; second API 5, nested 68;
final API 5, nested 69. All exited; API 6 and both API 5 instances received SIGTERM.
The initial short-lived launch PID 4 ended with its command sandbox before readiness.

## Rerun: PASS

The sandboxed job could not give the nested client a model sign-in, so the client under test was run again
outside that sandbox, as a normal `codex exec` with the person's own sign-in and a read-only shell sandbox,
against the same prepared data folder and a fresh API on port 5451 (`bun src/server/index.ts`, same environment
as above). User configuration and rules were ignored, so the bridge was the only MCP server.

```sh
codex exec -m gpt-6.1-sol --ignore-user-config --ignore-rules -s read-only --json \
  -C /home/rodrigo/projetos/semantic-workbench-wt/021-docs \
  -c 'mcp_servers.sw_accept.command="bun"' \
  -c 'mcp_servers.sw_accept.args=["scripts/mcp-stdio.ts"]' \
  -c 'mcp_servers.sw_accept.env={DATA_DIR="/home/rodrigo/scratch/sw-docs/p3/local-data",SW_PORT="5451"}' \
  -c 'mcp_servers.sw_accept.default_tools_approval_mode="approve"' \
  '<the same task as above>'
```

Without `default_tools_approval_mode`, Codex refuses the first tool that is not read-only (`save_file`) in a
non-interactive run, because its approval policy there is `never`. That refusal is Codex's own; the workbench
answered every call it received. Allowed values are `auto`, `prompt`, `writes` and `approve`.

| Step | Result | Answer summary |
| --- | --- | --- |
| Discover/list MCP tools | PASS | 23 tools |
| List mapped-commerce files | PASS | the four Mapped commerce files |
| Read one file | PASS | `commerce.mapped-semantic.yaml`, 3,891 bytes, no findings |
| Validate one-line comment edit | PASS | `valid: true`, no findings, guard `accepted` |
| Save edit | PASS | saved with `baseVersion`, new version returned |
| Commit edit with message | PASS | `git_commit` with expected branch `work/local`, expected head and an idempotency key; commit `eed6c53` "Review commerce definitions", confirmed with `git log` in the data repository |
| Read published catalog through MCP | PASS | `mapped-commerce/commerce.mapping.yaml` at snapshot `75f925c` |

Seven distinct tools were called (`list_files`, `read_file`, `validate_text`, `save_file`, `git_status`,
`git_commit`, `get_mapping_catalog`). Raw logs: `rerun2.jsonl`, `rerun2-final.txt` and `rerun-server.log` under
`/home/rodrigo/scratch/sw-docs/p3/`. The API was stopped by its exact PID.
