import csv
import io
from hashlib import sha256
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import create_app
from app.reporting import quality_passport


def test_overlapping_findings_count_each_depth_once():
    dataset = SimpleNamespace(original=b"original", data={"depth": [10, 11, 12, 13], "depth_unit": "m",
        "curves": {"GR": {"unit": "", "values": [1, None, 3, 4]}}})
    analysis = SimpleNamespace(settings={"curves": ["GR"], "methods": ["missing", "outlier"]},
        result={"findings": [{"start": 10, "end": 12, "method": "missing"},
                             {"start": 11, "end": 13, "method": "outlier"}]})
    passport = quality_passport(dataset, analysis, [{"status": "dismissed"}])
    assert passport["affected_samples"] == 4
    assert passport["affected_percent"] == 100
    assert passport["missing_values"] == 1
    assert passport["unknown_units"] == ["GR"]
    assert passport["review"] == {"confirmed": 0, "dismissed": 1, "pending": 1}
    assert passport["original_sha256"] == sha256(b"original").hexdigest()
    analysis.result["findings"] = []
    empty = quality_passport(dataset, analysis, [])
    assert empty["stage"] == "no_findings" and empty["affected_samples"] == 0
    assert any("не подтверждает" in step for step in empty["next_steps"])


def test_report_exports_reflect_review_and_survive_restart(tmp_path):
    raw = b"DEPTH [m],RHOB [g/cm3]\n1,2.4\n2,-1\n3,2.5\n4,\n"
    with TestClient(create_app(tmp_path, seed=False)) as c:
        well = c.post("/api/datasets/upload", files={"file": ("field.csv", raw)},
                      data={"source": "synthetic"}).json()
        assert well["source"] == "synthetic"
        copied = c.post("/api/datasets/upload", files={"file": ("renamed.csv", raw)}).json()
        assert copied["source"] == "synthetic"
        assert c.post("/api/datasets/upload", files={"file": ("field.csv", raw)},
                      data={"source": "invalid"}).status_code == 422
        run = c.post("/api/analysis/run", json={"dataset_id": well["id"], "curves": ["RHOB"],
                                              "methods": ["physical", "missing"]}).json()
        path = "/api/reports/" + run["id"]
        report = c.get(path).json()
        assert report["passport"]["affected_samples"] == 2
        assert report["passport"]["review"]["pending"] == 2
        comment = '=HYPERLINK("https://example.org")\nПроверено'
        c.put(f'/api/analysis/{run["id"]}/reviews/0', json={"status": "confirmed", "comment": comment}).raise_for_status()
        report = c.get(path).json()
        assert report["passport"]["review"] == {"confirmed": 1, "dismissed": 0, "pending": 1}
        rows = list(csv.DictReader(io.StringIO(c.get(path + "/csv").content.decode("utf-8-sig"))))
        assert len(rows) == 2
        assert rows[0]["review_status"] == "confirmed"
        assert rows[0]["review_comment"] == "'" + comment
        assert rows[1]["review_status"] == "pending"
        assert rows[0]["finding_number"] == "1"
        text = c.get(path + "/summary").content.decode("utf-8-sig")
        assert sha256(raw).hexdigest() in text and "Синтетические данные" in text
        assert "подтверждено 1" in text
        assert c.get("/api/datasets/" + well["id"] + "/original").content == raw
    with TestClient(create_app(tmp_path, seed=False)) as c:
        assert c.get(path).json()["passport"]["review"]["confirmed"] == 1
        assert c.get("/api/reports/absent/summary").status_code == 404
