# Local mode behind an authenticating edge

Use this when one person should reach a local-mode Workbench through a sign-in proxy on a server,
for example a development instance at a public name. Shared use with several people needs server
mode instead; see [shared-server operation](../docs/server-mode.md).

## Why a proxy sits in front of the Workbench

Local mode has no sign-in. To stay safe on a desktop it serves loopback only:

- It refuses to start when `SW_HOST` is not a loopback address.
- It answers 403 to a request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]`, which stops
  DNS rebinding.
- It answers 403 to a request whose `Origin` is not the Workbench's own loopback origin, which stops
  other sites from sending requests through the browser.

An edge that reaches its backends by network address cannot use loopback (a Kubernetes
EndpointSlice, for example, refuses it). And it sends the public name as `Host`, and browsers send
the public origin as `Origin`. So the Workbench keeps listening on loopback, and
[`scripts/edge-proxy.ts`](../scripts/edge-proxy.ts) listens on the server's address and passes
requests on.

## What the proxy changes

The proxy changes exactly two headers, and only when they match the configured public origin:

| Header from the edge | Sent to the Workbench |
| --- | --- |
| `Host` equal to the host of `EDGE_PUBLIC_ORIGIN` | the host of `EDGE_UPSTREAM_ORIGIN` |
| `Origin` equal to `EDGE_PUBLIC_ORIGIN` | `EDGE_UPSTREAM_ORIGIN` |

Every other `Host` or `Origin` is passed on unchanged, so the Workbench still answers 403 to it. A
request without `Origin` is passed on without one. Bodies and compressed responses pass through
unchanged, and connections are never closed for being idle. The Workbench sends a heartbeat on its
event stream every 15 seconds, so the stream stays open through edges that close quiet connections.
When the Workbench is down, the proxy answers 502.

The proxy adds no access control of its own. The edge must sign people in and refuse everyone
except the owner before any request reaches the proxy. The proxy's port must be closed to the
internet, for example with a firewall rule, so that the edge is the only way in.

## Settings

| Variable | Meaning | Example |
| --- | --- | --- |
| `EDGE_PUBLIC_ORIGIN` | The origin people open in the browser, scheme and host | `https://workbench.example.org` |
| `EDGE_UPSTREAM_ORIGIN` | The local-mode Workbench's loopback origin | `http://127.0.0.1:4310` |
| `EDGE_LISTEN_HOST` | The server address the edge connects to | `10.0.0.5` |
| `EDGE_LISTEN_PORT` | The port the edge connects to; it may equal the Workbench's port | `4310` |

## Running both as systemd services

Build once in the checkout (`bun install` and `bun --bun run build`), then start the Workbench and
the proxy as an unprivileged user. Keep the data folder outside the checkout.

```sh
systemd-run --unit=workbench --uid=workbench --gid=workbench -p Restart=on-failure \
  --working-directory=/srv/workbench/app \
  --setenv=SW_MODE=local --setenv=SW_HOST=127.0.0.1 --setenv=SW_PORT=4310 \
  --setenv=SW_SERVE_STATIC=1 --setenv=DATA_DIR=/srv/workbench/data \
  bun src/server/index.ts

systemd-run --unit=workbench-edge --uid=workbench --gid=workbench -p Restart=on-failure \
  --working-directory=/srv/workbench/app \
  --setenv=EDGE_PUBLIC_ORIGIN=https://workbench.example.org \
  --setenv=EDGE_UPSTREAM_ORIGIN=http://127.0.0.1:4310 \
  --setenv=EDGE_LISTEN_HOST=10.0.0.5 --setenv=EDGE_LISTEN_PORT=4310 \
  bun scripts/edge-proxy.ts
```

## Checks after starting

Run these on the server:

```sh
curl -s -H 'Host: workbench.example.org' http://10.0.0.5:4310/healthz          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: other.example' http://10.0.0.5:4310/api/projects   # 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: workbench.example.org' \
  -H 'Origin: https://other.example' -X POST http://10.0.0.5:4310/api/projects                      # 403
curl -sN -H 'Host: workbench.example.org' http://10.0.0.5:4310/api/events | head -c 200            # ": ping" lines
```

From outside the server, the proxy's port must not answer. The public name must send a signed-out
visitor to the sign-in page, and it must refuse a signed-in account that is not the owner.
