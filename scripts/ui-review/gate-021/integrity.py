"""Compare application source copies with their recorded Git objects."""

import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path("/srv/dev/sw/021-journey")
records = []
for side, revision in [("main", "4efb44e2"), ("candidate", "990d6659")]:
    tree = subprocess.check_output(["git", "ls-tree", "-r", revision, "--", "src", "public", "schemas", "package.json", "bun.lock"], text=True)
    mismatches = []
    count = 0
    for line in tree.splitlines():
        metadata, path = line.split("\t")
        expected = metadata.split()[2]
        content = (ROOT / side / path).read_bytes()
        actual = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()
        count += 1
        if actual != expected:
            mismatches.append(path)
    records.append({"side": side, "revision": revision, "checkedFiles": count, "mismatches": mismatches})
    print(side, count, mismatches)
(ROOT / "application-integrity.json").write_text(json.dumps(records, indent=2))
