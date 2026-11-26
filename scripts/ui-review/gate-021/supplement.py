"""Repeat the supplemental journeys with their corrected fixtures."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


ROOT = Path("/srv/dev/sw/021-journey")
for side in ["main", "candidate"]:
    directory = ROOT / side
    for file in Path("scripts/ui-review/gate-021").glob("*.ts"):
        shutil.copy2(file, directory / file)
    environment = dict(os.environ, TMPDIR=str(ROOT / "temporary"))
    server = subprocess.Popen(["bun", "scripts/ui-review/gate-021/static.ts"], cwd=directory, env=environment)
    print("OWNED_STATIC_PID", server.pid, flush=True)
    try:
        for repeat in [1, 2]:
            for group in sys.argv[1:] or ["labels", "gaps", "conversion", "policy", "governance"]:
                output = ROOT / "captures" / side / str(repeat) / group
                if output.exists():
                    archive = ROOT / "attempts" / f"{side}-{repeat}-{group}-{int(time.time())}"
                    archive.parent.mkdir(parents=True, exist_ok=True)
                    output.rename(archive)
                output.mkdir(parents=True, exist_ok=True)
                environment["JOURNEY_OUTPUT"] = str(output)
                arguments = ["bun", "--preload", "./scripts/ui-review/gate-021/observe.ts", f"scripts/ui-review/gate-021/{group}.ts"]
                with (output / "run.log").open("w") as stream:
                    result = subprocess.run(arguments, cwd=directory, env=environment, stdout=stream, stderr=subprocess.STDOUT, timeout=600)
                with (ROOT / "commands.jsonl").open("a") as stream:
                    stream.write(json.dumps({"command": arguments, "side": side, "repeat": repeat, "exit": result.returncode}) + "\n")
                print(group, side, repeat, result.returncode, flush=True)
    finally:
        server.terminate()
        server.wait(timeout=20)
        print("STOPPED_STATIC_PID", server.pid, flush=True)
