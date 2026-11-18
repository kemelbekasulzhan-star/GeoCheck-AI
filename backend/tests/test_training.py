import pytest
from fastapi.testclient import TestClient
from app.main import create_app


def demo_request(c):
    wells = c.post("/api/demo/restore").json()
    req = {"name": "IF test", "curves": list(wells[0]["units"]),
           "train_ids": [w["id"] for w in wells if w["demo_role"] == "train"],
           "test_ids": [w["id"] for w in wells if w["demo_role"] == "test"], "trees": 30}
    return wells, req


def test_restoration_is_idempotent_and_persists_model(tmp_path):
    with TestClient(create_app(tmp_path, seed=False)) as c:
        wells, req = demo_request(c)
        assert len(c.post("/api/demo/restore").json()) == 3
        assert len(c.get("/api/datasets").json()) == 3
        response = c.post("/api/models/train", json=req)
        assert response.status_code == 201, response.text
        model = response.json()
        assert model["train_rows"] == 1602
        assert model["evaluation"][0]["metrics"]["tp"] >= 1
        assert model["evaluation"][0]["metrics"]["label_source"] == "synthetic"
        assert len(model["train"]) == 2
        assert "artifact" not in model
        test_id = req["test_ids"][0]
    with TestClient(create_app(tmp_path, seed=False)) as c:
        assert len(c.get("/api/models").json()) == 1
        request = {"dataset_id": test_id, "curves": req["curves"], "trained_model_id": model["id"]}
        response = c.post("/api/analysis/run", json=request)
        assert response.status_code == 201, response.text
        run = response.json()
        assert run["model"]["id"] == model["id"]
        reviews = f'/api/analysis/{run["id"]}/reviews'
        assert c.put(reviews+"/0", json={"status":"confirmed","comment":"Проверено"}).status_code == 200
        assert c.put(reviews+"/0", json={"status":"dismissed","comment":"Граница пласта"}).status_code == 200
        entries = c.get(reviews).json()
        assert len(entries) == 1 and entries[0]["status"] == "dismissed"
        assert c.get('/api/reports/'+run["id"]).json()["reviews"] == entries
        assert c.put(reviews+"/9999",json={"status":"confirmed"}).status_code == 422
        assert c.post("/api/analysis/run",json={**request,"curves":["GR"]}).status_code == 422


def test_leakage_and_unit_validation(tmp_path):
    with TestClient(create_app(tmp_path, seed=False)) as c:
        wells, req = demo_request(c)
        assert c.post("/api/models/train",json={**req,"test_ids":req["train_ids"][:1]}).status_code == 422
        original = c.get("/api/datasets/"+req["train_ids"][0]+"/original").content
        uploaded = c.post("/api/datasets/upload",files={"file":("copy.csv",original)}).json()
        response = c.post("/api/models/train",json={**req,"test_ids":[uploaded["id"]]})
        assert response.status_code == 422 and "копия" in response.text
        changed = original.replace(b"GR [API]",b"GR [unknown]")
        wrong = c.post("/api/datasets/upload",files={"file":("units.csv",changed)}).json()
        response = c.post("/api/models/train",json={**req,"test_ids":[wrong["id"]]})
        assert response.status_code == 422 and "единицы" in response.text


def test_unlabelled_holdout_has_no_fabricated_metrics(tmp_path):
    with TestClient(create_app(tmp_path, seed=False)) as c:
        wells, req = demo_request(c)
        raw = c.get("/api/datasets/"+req["test_ids"][0]+"/original").content.replace(b"2100.0,",b"2099.9,",1)
        uploaded = c.post("/api/datasets/upload",files={"file":("Real-unlabelled.csv",raw)}).json()
        response = c.post("/api/models/train",json={**req,"test_ids":[uploaded["id"]]})
        assert response.status_code == 201, response.text
        assert response.json()["evaluation"][0]["metrics"] is None
        assert response.json()["data_scope"] == "user"

