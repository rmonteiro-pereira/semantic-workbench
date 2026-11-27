"""Assemble capture coverage, visual decisions and an offline review index."""

from collections import Counter
import html
import json
from pathlib import Path
import sys


ROOT = Path(sys.argv[1])
data = json.loads((ROOT / "results.json").read_text())
rows = data["steps"] if isinstance(data, dict) else data
reviews = json.loads((ROOT / "reviews.json").read_text()) if (ROOT / "reviews.json").exists() else {}
missing_path = ROOT / "missing-image-paths.json"
missing = set(json.loads(missing_path.read_text())) if missing_path.exists() else set()
for row in rows:
    for side in row["sides"]:
        for passage in side:
            passage["captured"] = passage["file"] not in missing
            passage["worked"] = passage["worked"] and passage["captured"]
    review = reviews.get(row["identity"])
    if any(not passage["worked"] for side in row["sides"] for passage in side):
        row["class"] = "not-compared"
        row["reason"] = "The requested action failed in at least one passage; the screenshot shows a fallback state."
    elif review:
        row.update(review)
    elif row["class"] == "pending-review" and row.get("nonTokenExcess") == 0 and row.get("tokenPixels", 0) > 0:
        row["class"] = "intended"
        row["reason"] = "Every stable changed pixel matches the approved light success colour transformation; remaining changes fall within measured repetition noise."
        row["reviewMethod"] = "exact success-colour delta, with representative visual checks"
for row in rows:
    if any(not side[0]["hashes"] for side in row["sides"]):
        row["visualClass"] = row.get("visualClass", row["class"])
        row["class"] = "not-compared"
        row["dataMatch"] = None
        row["reason"] = "Input hashes were not recorded for this custom fixture or mock; identical loaded data is not established."
counts = Counter(row["class"] for row in rows)
coverage = json.loads((ROOT / "coverage.json").read_text())
result = {
    "baseline": "4efb44e2",
    "candidate": "990d6659",
    "sideOrder": ["main", "candidate"],
    "classes": dict(counts),
    "steps": rows,
    "unreachableActions": coverage["unreachableActions"],
    "examples": coverage["examples"],
    "labels": coverage["labels"],
    "attributeFonts": coverage["attributeFonts"],
    "consoleErrors": coverage.get("consoleErrors", []),
}
(ROOT / "results.json").write_text(json.dumps(result))
(ROOT / "classification-counts.json").write_text(json.dumps(counts, indent=2))
table = []
for row in rows:
    identity = html.escape(row["identity"])
    image = row.get("strip")
    label = f'<a href="{html.escape(image)}">{identity}</a>' if image else identity
    score = f"{row['diffScore']:.6f}" if "diffScore" in row else "—"
    reason = html.escape(row.get("reason", ""))
    table.append(f"<tr data-class='{row['class']}'><td>{label}</td><td>{row['class']}</td><td>{score}</td><td>{reason}</td></tr>")
summary = html.escape(json.dumps(dict(counts)))
document = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journey comparison</title>
<style>
body{{font:16px system-ui;margin:24px;color:#183a32;background:#f5f8f7}} h1{{font-size:26px}}
input,select{{font:inherit;padding:8px;margin:4px;max-width:95%}} table{{border-collapse:collapse;width:100%;background:white}}
td,th{{padding:10px;border-bottom:1px solid #cad8d2;text-align:left;overflow-wrap:anywhere}} a{{color:#145e86}}
td:first-child{{max-width:420px}} .table{{overflow:auto}} code{{overflow-wrap:anywhere}}
td:nth-child(2),th:nth-child(2),td:nth-child(3),th:nth-child(3){{white-space:nowrap;overflow-wrap:normal;width:110px}}
@media(max-width:600px){{body{{margin:12px}} td,th{{padding:6px}} td:last-child,th:last-child{{display:none}}}}
</style>
<h1>Journey comparison</h1>
<p>Baseline <code>4efb44e2</code>; candidate <code>990d6659</code>. Two passages per side.</p>
<p>{summary}</p><p>Pending review and missing pairs remain open. An exit code of zero does not establish that every state worked.</p>
<label>Find a state <input id="search" type="search"></label>
<label>Classification <select id="class"><option value="">All</option>{"".join(f"<option>{html.escape(key)}</option>" for key in sorted(counts))}</select></label>
<p><a href="HANDOFF.md">Handoff</a> · <a href="regressions.md">Regressions</a> · <a href="results.json">Detailed results</a></p>
<div class="table"><table><thead><tr><th>Screen and state</th><th>Class</th><th>Pixel score</th><th>Disposition</th></tr></thead>
<tbody>{"".join(table)}</tbody></table></div>
<script>
function filter(){{
  const text=document.querySelector('#search').value.toLowerCase();
  const classification=document.querySelector('#class').value;
  for(const row of document.querySelectorAll('tbody tr')){{
    row.hidden=!row.textContent.toLowerCase().includes(text)||(classification&&row.dataset.class!==classification);
  }}
}}
document.querySelector('#search').addEventListener('input',filter);
document.querySelector('#class').addEventListener('change',filter);
</script></html>"""
(ROOT / "index.html").write_text(document)
print(json.dumps(dict(counts)))
