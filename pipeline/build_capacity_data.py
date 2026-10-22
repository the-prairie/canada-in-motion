"""Package the reviewed CIHI/CBE extracts; does not change their source vintages."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workforce = json.loads((ROOT / "capacity-workforce-research.json").read_text())
schools = json.loads((ROOT / "capacity-schools-research.json").read_text())
snapshot = {
    "schemaVersion": 1,
    "reviewedAt": "2026-10-21",
    "scope": "Alberta RN registration supply and Calgary Board of Education case studies. Conditional arithmetic, not estimated policy effects.",
    "updatePolicy": "Reviewed source snapshot. Re-run the extractors and source validation before updating; not an automatic live feed.",
    "sources": workforce["sources"] + schools["sources"],
    "workforce": workforce["registeredNurses"],
    "employerContext": workforce["employerContext"],
    "schools": {key: value for key, value in schools.items() if key != "sources"},
}
(ROOT / "capacity-data.json").write_text(json.dumps(snapshot, indent=2) + "\n")
