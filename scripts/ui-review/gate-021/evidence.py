"""Summarise selected passages, loaded data and unreached actions."""

import hashlib
import json
from pathlib import Path
import sys


ROOT = Path(sys.argv[1])
OUTPUT = ROOT / "comparison"
OUTPUT.mkdir(exist_ok=True)


def records(path):
    """Read an incremental capture record when it is present."""
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def selected(side, repeat, group):
    """Prefer dedicated feature and tour passages over interrupted earlier attempts."""
    for passage in [repeat + 4, repeat + 2, repeat]:
        directory = ROOT / "captures" / side / str(passage) / group
        if directory.exists():
            return directory
    return None


coverage = []
failures = []
fonts = []
labels = []
console_errors = []
for side in ["main", "candidate"]:
    groups = {folder.name for passage in (ROOT / "captures" / side).iterdir() for folder in passage.iterdir() if folder.is_dir()}
    for repeat in [1, 2]:
        for group in sorted(groups):
            directory = selected(side, repeat, group)
            if not directory:
                continue
            images = list(directory.glob("*.png"))
            errors = records(directory / "browser-errors.jsonl")
            missing = records(directory / "failures.jsonl") + records(directory / "missing.jsonl")
            if group == "settings":
                log = directory / "settings.log"
                if log.exists():
                    missing.extend({"state": line.split(" ", 2)[1], "error": line, "type": "unreachable"} for line in log.read_text().splitlines() if line.startswith("MISSING "))
            for observation in records(directory / "observations.jsonl"):
                if observation.get("errors"):
                    console_errors.append({"side": side, "repeat": repeat, "group": group, "file": observation.get("file"), "errors": observation["errors"]})
            coverage.append(
                {"side": side, "repeat": repeat, "group": group, "directory": str(directory), "images": len(images), "unreachable": len(missing), "browserErrors": len(errors)}
            )
            failures.extend({"side": side, "repeat": repeat, "group": group, **failure} for failure in missing)
            if group == "labels" and (directory / "labels.json").exists():
                labels.extend({"side": side, "repeat": repeat, **row} for row in json.loads((directory / "labels.json").read_text()))
            if group == "item-editors":
                unique = {row["file"]: row for row in records(directory / "input-fonts.jsonl")}
                for row in unique.values():
                    if "attribute-dialog" not in row["file"]:
                        continue
                    name = next((item for item in row["inputs"] if (item.get("text") or "").strip().startswith("Name")), None)
                    reading = next((item for item in row["inputs"] if (item.get("text") or "").strip().startswith("Reading sentence")), None)
                    equal = bool(name and reading and all(name[key] == reading[key] for key in ["fontFamily", "fontSize"]) and abs(name["height"] - reading["height"]) <= 0.5)
                    fonts.append({"side": side, "repeat": repeat, "file": row["file"], "name": name, "reading": reading, "equal": equal})

examples = []
for side in ["main", "candidate"]:
    manifest = json.loads((ROOT / f"{side}-examples.json").read_text())
    digest = hashlib.sha256(json.dumps(manifest, separators=(",", ":")).encode()).hexdigest()
    examples.append({"side": side, "files": len(manifest), "sha256": digest})

result = {"coverage": coverage, "unreachableActions": failures, "labels": labels, "attributeFonts": fonts, "examples": examples, "consoleErrors": console_errors}
(OUTPUT / "coverage.json").write_text(json.dumps(result, indent=2))
print(json.dumps({"groups": len(coverage), "images": sum(row["images"] for row in coverage), "unreachableActions": len(failures), "fontComparisons": len(fonts)}))
