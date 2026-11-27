"""Stop only completed capture workers and the processes they started."""

import json
import os
from pathlib import Path
import signal
import sys
import time


ROOT = Path("/srv/dev/sw/021-journey")


def identity(pid):
    """Distinguish an owned process from a later reuse of the same PID."""
    try:
        directory = Path("/proc") / str(pid)
        if directory.stat().st_uid != os.getuid():
            return None
        fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
        return int(fields[1]), fields[19]
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        return None


def descendants(root_pid):
    """Snapshot descendants before their parent exits."""
    processes = {int(path.name): identity(int(path.name)) for path in Path("/proc").iterdir() if path.name.isdigit()}
    selected = {root_pid}
    while True:
        children = {pid for pid, state in processes.items() if state and state[0] in selected}
        if children <= selected:
            break
        selected |= children
    return {pid: processes[pid][1] for pid in selected if processes.get(pid)}


def stop(root_pid):
    """Signal exact recorded PIDs, checking that each still identifies the same process."""
    processes = descendants(root_pid)
    try:
        os.kill(root_pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    for kind in [signal.SIGTERM, signal.SIGKILL]:
        for pid, started in processes.items():
            state = identity(pid)
            if state and state[1] == started:
                try:
                    os.kill(pid, kind)
                except ProcessLookupError:
                    pass
        time.sleep(2)
    return list(processes)


ledger = [json.loads(line) for line in (ROOT / "commands.jsonl").read_text().splitlines()]
stopped = []
phase = sys.argv[1] if len(sys.argv) > 1 else "graphs"
repeats = [1, 2] if phase == "graphs" else [3, 4]
for side in ["main", "candidate"]:
    for repeat in repeats:
        group = "graphs" if phase == "graphs" else "server-tour-dark"
        name = "graphs-1920-dark.log" if phase == "graphs" else "server-tour-dark.log"
        log = str(ROOT / "captures" / side / str(repeat) / group / name)
        if not any(row.get("log") == log and row.get("exit") == 0 for row in ledger):
            continue
        expected = ["python3", "scripts/ui-review/gate-021/journey.py", "worker", side, str(repeat)]
        if phase != "graphs":
            expected.append("rest")
        for path in Path("/proc").iterdir():
            if not path.name.isdigit() or not identity(int(path.name)):
                continue
            try:
                command = (path / "cmdline").read_bytes().decode().strip("\0").split("\0")
            except (FileNotFoundError, PermissionError):
                continue
            if command == expected:
                stopped.append({"side": side, "repeat": repeat, "pids": stop(int(path.name))})
with (ROOT / "stopped-passages.jsonl").open("a") as stream:
    for row in stopped:
        stream.write(json.dumps(row) + "\n")
print(json.dumps(stopped))
