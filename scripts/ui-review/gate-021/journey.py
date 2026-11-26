"""Run matched capture commands in disposable source copies."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


ROOT = Path("/srv/dev/sw/021-journey")
SOURCE = Path.cwd()
REVISIONS = {"main": "4efb44e2", "candidate": "990d6659"}
ENV = dict(os.environ, TMPDIR=str(ROOT / "temporary"), SW_BASE_URL="http://127.0.0.1:5410")


def command(arguments, cwd, log, timeout=1800, env=None):
    """Keep command text, status and timing beside its complete output."""
    started = time.time()
    with log.open("w") as stream:
        try:
            result = subprocess.run(arguments, cwd=cwd, env=env or ENV, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout)
            status = result.returncode
        except subprocess.TimeoutExpired:
            status = 124
    with (ROOT / "commands.jsonl").open("a") as stream:
        stream.write(json.dumps({"command": arguments, "cwd": str(cwd), "exit": status, "seconds": time.time() - started, "log": str(log)}) + "\n")
    print("COMMAND", cwd.name, arguments[-2:], status, flush=True)
    return status


def edit(directory, path, transform):
    file = directory / path
    file.write_text(transform(file.read_text()))


def prepare(side, revision):
    """Extract immutable application sources and instrument capture code only."""
    directory = ROOT / side
    directory.mkdir(exist_ok=True)
    archive = subprocess.Popen(["git", "archive", revision], stdout=subprocess.PIPE)
    subprocess.run(["tar", "-x", "-C", str(directory)], stdin=archive.stdout, check=True)
    archive.wait()
    for folder in ["scripts/ui-review", "scripts/helpers"]:
        for file in (SOURCE / folder).rglob("*"):
            target = directory / file.relative_to(SOURCE)
            if file.is_file() and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, target)
    settings = Path("specs/021-loose-ends/settings-review")
    if not (directory / settings).exists():
        shutil.copytree(SOURCE / settings, directory / settings)
    harness = directory / "scripts/ui-review/gate-021"
    shutil.copytree(SOURCE / "scripts/ui-review/gate-021", harness, dirs_exist_ok=True)
    edit(
        directory,
        "scripts/helpers/sign-in.ts",
        lambda text: re.sub(
            r"export const authViewports = \[.*?\] as const;",
            "export const authViewports = JSON.parse(process.env.JOURNEY_VIEWPORTS ?? '[[390,844],[1440,900]]') as [number,number][];",
            text,
            flags=re.S,
        ),
    )
    edit(directory, "scripts/helpers/processes.ts", lambda text: "let nextCapturePort = 5430;\n" + text.replace("port: 0, socket:", "port: nextCapturePort++, socket:"))
    edit(directory, "scripts/helpers/isolated-api.ts", lambda text: "let nextApiPort = 5460;\n" + text.replace("let port = 0;", "let port = nextApiPort++;"))
    edit(
        directory,
        "scripts/helpers/isolated-api.ts",
        lambda text: (
            "import { recordExample, recordFiles } from '../ui-review/gate-021/data';\n"
            + text.replace(
                "let current = await start();",
                """let current = await start();
  const originalLoad = current.ws.loadExample.bind(current.ws);
  current.ws.loadExample = async (...args) => {
    recordExample(args[0]);
    return originalLoad(...args);
  };
  const originalImport = current.ws.importBatch.bind(current.ws);
  current.ws.importBatch = async (...args) => {
    recordFiles(args[0].files, 'import:' + args[0].name);
    return originalImport(...args);
  };""",
            )
        ),
    )
    for file in (directory / "scripts/ui-review").rglob("*.ts"):
        if "gate-021" in str(file):
            continue
        text = file.read_text().replace("port: 0,", "port: 5480,").replace("http://127.0.0.1:5190", "http://127.0.0.1:5410")
        text = text.replace("setDefaultTimeout(3000)", "setDefaultTimeout(10000)")
        text = text.replace("width === 1280", "width === 1440")
        text = text.replace("[1280,", "[1440,").replace("[360,", "[390,")
        if "feature-states" in str(file):
            text = re.sub(
                r"const (VIEWPORTS|RELEASED_VIEWPORTS): Viewport\[\] = \[.*?\];",
                r"const \1: Viewport[] = [[1440, 'light'], [390, 'light'], [1440, 'dark'], [390, 'dark']];",
                text,
                flags=re.S,
            )
        text = text.replace("const IMAGE_LIMIT = 110;", "const IMAGE_LIMIT = 100000;")
        file.write_text(text)
    edit(
        directory,
        "scripts/ui-review/feature-states/dev-server.ts",
        lambda text: text[: text.index("const VITE_PORT")] + "export async function startDevServer() { return async () => {}; }\n",
    )
    edit(directory, "scripts/ui-review/feature-states/session.ts", lambda text: text.replace("http://127.0.0.1:5450", "http://127.0.0.1:5410"))
    edit(
        directory,
        settings / "capture-settings.ts",
        lambda text: text.replace("const images = 'out/settings-review/captures';", "const images = process.env.JOURNEY_OUTPUT!;").replace(
            "imageCount >= 40", "imageCount >= 100000"
        ),
    )
    examples = [(str(file.relative_to(directory)), hashlib.sha256(file.read_bytes()).hexdigest()) for file in sorted((directory / "public/examples").rglob("*")) if file.is_file()]
    (ROOT / f"{side}-examples.json").write_text(json.dumps(examples, indent=2))
    if command(["bun", "install", "--frozen-lockfile"], directory, ROOT / f"{side}-install.log"):
        raise RuntimeError("Install failed")
    if command(["bun", "--bun", "run", "build"], directory, ROOT / f"{side}-build.log"):
        raise RuntimeError("Build failed")
    return directory


def capture_side(side, directory, repeat, phase="all"):
    """Serialize each journey while keeping failures visible in the ledger."""
    server_log = (ROOT / f"{side}-static-{repeat}.log").open("w")
    server = subprocess.Popen(["bun", "scripts/ui-review/gate-021/static.ts"], cwd=directory, env=ENV, stdout=server_log, stderr=subprocess.STDOUT)
    print("OWNED_STATIC_PID", server.pid, flush=True)
    time.sleep(1)
    jobs = [(f"graphs-{width}-{theme}", ["scripts/ui-review/capture-states.ts", "{output}", "graphs"]) for width in [390, 1440, 1920] for theme in ["light", "dark"]]
    jobs += [
        ("rest", ["scripts/ui-review/capture-states.ts", "{output}", "rest"]),
        ("tour-light", ["scripts/ui-review/capture-tour.ts", "{output}", "local", "light"]),
        ("tour-dark", ["scripts/ui-review/capture-tour.ts", "{output}", "local", "dark"]),
        ("server-tour-light", ["scripts/ui-review/capture-tour.ts", "{output}", "server", "light"]),
        ("server-tour-dark", ["scripts/ui-review/capture-tour.ts", "{output}", "server", "dark"]),
        ("admin", ["scripts/ui-review/admin-states.ts", "{output}"]),
    ]
    jobs += [
        (group, ["scripts/ui-review/feature-states.ts", "{output}", group])
        for group in ["proposals", "connections", "agent", "traffic", "attributes", "diff", "mesh", "compile", "item-editors"]
    ]
    jobs += [("settings", ["specs/021-loose-ends/settings-review/capture-settings.ts"])]
    if phase == "rest":
        jobs = [(group, arguments) for group, arguments in jobs if not group.startswith("graphs-")]
    try:
        for group, arguments in jobs:
            output_group = "graphs" if group.startswith("graphs-") else group
            output = ROOT / "captures" / side / str(repeat) / output_group
            output.mkdir(parents=True, exist_ok=True)
            env = dict(ENV, JOURNEY_OUTPUT=str(output), CAPTURE_ROUND="2")
            if group.startswith("graphs-"):
                _, width, theme = group.split("-")
                height = {390: 844, 1440: 900, 1920: 1080}[int(width)]
                env["JOURNEY_VIEWPORTS"] = json.dumps([[int(width), height]])
                env["SW_THEME"] = theme
            args = ["bun", "--preload", "./scripts/ui-review/gate-021/observe.ts"] + [str(output) if value == "{output}" else value for value in arguments]
            command(args, directory, output / f"{group}.log", env=env)
    finally:
        server.terminate()
        server.wait(timeout=20)
        server_log.close()
        print("STOPPED_STATIC_PID", server.pid, flush=True)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "temporary").mkdir(exist_ok=True)
    if len(sys.argv) >= 4 and sys.argv[1] == "worker":
        side = sys.argv[2]
        repeat = int(sys.argv[3])
        phase = sys.argv[4] if len(sys.argv) > 4 else "all"
        capture_side(side, ROOT / side, repeat, phase)
        (ROOT / f"COMPLETE-{side}-{repeat}").write_text("done\n")
    else:
        directories = {side: prepare(side, revision) for side, revision in REVISIONS.items()}
        subprocess.run(["python3", "scripts/ui-review/gate-021/patch-captures.py"], check=True)
        for repeat in [1, 2]:
            for side, directory in directories.items():
                capture_side(side, directory, repeat)
        (ROOT / "CAPTURE_COMPLETE").write_text("done\n")
