#!/bin/bash
export HOME=/home/dev PATH=/home/dev/.bun/bin:/usr/local/bin:/usr/bin:/bin TMPDIR=/srv/dev/tmp-006-mcp-server
mkdir -p $TMPDIR
cd /srv/dev/sw/006-mcp-server
mkdir -p out
status=out/gate-status.txt
: > $status
step() {
  name=$1
  shift
  echo "start $name $(date +%T)" >> $status
  "$@" > out/gate-$name.log 2>&1
  echo "$name exit=$? $(date +%T)" >> $status
}
step test bun test
step check bun --bun run check
step build bun --bun run build
step mutation bun scripts/ci-validate.ts --step mutation
step mcp bun run test:mcp
step mcpbrowser bun run test:mcp:browser
step admin bun run test:admin
echo "all-done" >> $status
