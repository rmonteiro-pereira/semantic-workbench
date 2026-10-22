# SSE events: changes in v0.3.0

Base: [001 SSE events](../../001-workbench-improvements/contracts/sse-events.md).

| Event | Data | When |
| --- | --- | --- |
| `git` | adds `repo` and `projects: [slug]` | any Git change in a repository; every listed project rescans |
| `clone` | `{op, phase, name?, message?, repo?, invalid?, candidates?, manifest?, manifestError?, projects?}` | clone progress and outcome; `invalid` lists files that are not valid definitions; `candidates` and `manifest` describe subfolder projects |
| `identity` | `{repo}` | identity written from the app |
| `projects` | unchanged shape; `added` includes subfolder projects | register, remove, clone |
