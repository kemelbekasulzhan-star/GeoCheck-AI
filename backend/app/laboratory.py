"""API for experiments, review decisions, and reproducible demo restoration."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import select, text

from .demo import DEMO_DIR, synthetic
from .ingest import parse_file
from .storage import Analysis, Dataset, Review, TrainedModel, now
from .training import TrainRequest, fit_saved


class ReviewRequest(BaseModel):
    status: Literal["pending", "confirmed", "dismissed"]
    comment: str = Field(default="", max_length=2000)


def model_summary(model):
    return {"id": model.id, "name": model.name, "created": model.created, **model.metadata_json}


def reviews_for(db, id):
    return [{"finding_index": r.finding_index, "status": r.status, "comment": r.comment, "updated": r.updated}
            for r in db.scalars(select(Review).where(Review.analysis_id == id))]


def attach_routes(app, session, get, summary, save_run, settings_type):
    router = APIRouter(prefix="/api")

    @router.get("/models")
    def models(db=Depends(session)):
        return [model_summary(m) for m in db.scalars(select(TrainedModel).order_by(TrainedModel.created.desc()))]

    @router.get("/models/{id}")
    def model(id: str, db=Depends(session)):
        return model_summary(get(db, TrainedModel, id))

    @router.post("/models/train", status_code=201)
    def train(req: TrainRequest, db=Depends(session)):
        training = [get(db, Dataset, id) for id in req.train_ids]
        testing = [get(db, Dataset, id) for id in req.test_ids]
        try:
            metadata, artifact = fit_saved(training, testing, req)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        m = TrainedModel(name=req.name.strip(), metadata_json=metadata, artifact=artifact)
        db.add(m)
        db.commit()
        return model_summary(m)

    @router.get("/analysis/{id}/reviews")
    def reviews(id: str, db=Depends(session)):
        get(db, Analysis, id)
        return reviews_for(db, id)

    @router.put("/analysis/{id}/reviews/{index}")
    def review(id: str, index: int, req: ReviewRequest, db=Depends(session)):
        # Serialize upserts with deletion and other reviewers in SQLite.
        db.execute(text("BEGIN IMMEDIATE"))
        run = get(db, Analysis, id)
        if not 0 <= index < len(run.result["findings"]):
            raise HTTPException(422, "Интервал отсутствует в этом анализе.")
        entry = db.get(Review, (id, index))
        if entry is None:
            entry = Review(analysis_id=id, finding_index=index, **req.model_dump())
            db.add(entry)
        else:
            entry.status = req.status
            entry.comment = req.comment
        entry.updated = now()
        db.commit()
        return reviews_for(db, id)

    @router.post("/demo/restore")
    def restore(db=Depends(session)):
        db.execute(text("BEGIN IMMEDIATE"))
        original = (DEMO_DIR / "GeoLab-01.csv").read_bytes()
        truth = json.loads((DEMO_DIR / "labels.json").read_text(encoding="utf-8"))
        specs = [("GeoLab-01", original, truth, "test")]
        for seed in (117, 118):
            frame, _ = synthetic(seed, False)
            specs.append((f"GeoLab-Train-{seed}", frame.to_csv(index=False).encode(), [], "train"))
        existing = list(db.scalars(select(Dataset)))
        restored = []
        for name, raw, labels, role in specs:
            dataset = next((d for d in existing if d.source == "synthetic" and d.original == raw), None)
            if dataset is None:
                dataset = Dataset(data=parse_file(raw, name + ".csv"), original=raw, source="synthetic")
                db.add(dataset)
                db.flush()
                existing.append(dataset)
            dataset.data = {**dataset.data, "truth": labels, "demo_role": role}
            if not db.scalar(select(Analysis.id).where(Analysis.dataset_id == dataset.id).limit(1)):
                save_run(db, dataset, settings_type(curves=list(dataset.data["curves"])))
            restored.append(dataset)
        db.commit()
        return [summary(d) for d in restored]

    app.include_router(router)

