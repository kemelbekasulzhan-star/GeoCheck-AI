import csv
import io
import os
from typing import Literal
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, UploadFile, Form
from pydantic import HttpUrl, TypeAdapter
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, delete, select, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .demo import DEMO_DIR
from .ingest import MAX_BYTES, parse_file
from .modules import QUALITY
from .schemas import RunRequest, Settings
from .storage import Analysis, Base, Dataset, Marker, Review, TrainedModel
from .laboratory import attach_routes, reviews_for
from .training import load_saved
from .ml import analyze
from .reporting import quality_passport, passport_text, spreadsheet_safe

ROOT = Path(__file__).resolve().parents[2]
LIMITATION = "Статистическое отклонение требует экспертной проверки. Фациальная граница также может вызвать предупреждение."


def summary(d):
    data = d.data
    return dict(id=d.id, source=d.source, created=d.created, name=data["name"], filename=data["filename"],
                format=data["format"], depth_unit=data["depth_unit"], rows=len(data["depth"]),
                start=data["depth"][0], end=data["depth"][-1],
                units={k: v["unit"] for k, v in data["curves"].items()},
                missing=sum(v is None for c in data["curves"].values() for v in c["values"]),
                demo_role=data.get("demo_role"), has_labels="truth" in data,
                source_url=data.get("source_url"))


def describe(a):
    return dict(id=a.id, dataset_id=a.dataset_id, created=a.created, settings=a.settings,
                versions=a.result["versions"], count=len(a.result["findings"]), notes=a.result["notes"],
                model=a.result.get("model"))


def save_run(db, dataset, settings, model=None):
    fitted = load_saved(model, dataset, settings.curves) if model else None
    result = analyze(dataset.data, settings, fitted_model=fitted).model_dump()
    if model:
        result["model"] = {"id": model.id, "name": model.name, "trained_on": model.metadata_json["train"]}
        result["versions"]["isolation"] = "Saved IF 2.0 / " + model.id
    run = Analysis(dataset_id=dataset.id, settings=settings.model_dump(), result=result)
    db.add(run)
    db.flush()
    return run


def create_app(folder=None, seed=True):
    folder = Path(folder or os.getenv("GEOCHECK_HOME", ROOT / "runtime"))
    folder.mkdir(parents=True, exist_ok=True)
    engine = create_engine("sqlite:///" + (folder / "geocheck.sqlite").as_posix(),
                           connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    @asynccontextmanager
    async def lifespan(app):
        Base.metadata.create_all(engine)
        with Session(engine) as db, db.begin():
            if seed and not db.get(Marker, "demo-v1"):
                raw = (DEMO_DIR / "GeoLab-01.csv").read_bytes()
                dataset = Dataset(data=parse_file(raw, "GeoLab-01.csv"), original=raw, source="synthetic")
                db.add(dataset)
                db.flush()
                save_run(db, dataset, Settings(curves=list(dataset.data["curves"])))
                db.add(Marker(id="demo-v1"))
        yield
        engine.dispose()

    app = FastAPI(title="GeoCheck AI", version="2.0.0", lifespan=lifespan)

    def session():
        with Session(engine) as db:
            yield db

    def get(db, model, id):
        obj = db.get(model, id)
        if obj is None:
            raise HTTPException(404, "Запись не найдена.")
        return obj

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": app.version, "module": QUALITY.id}

    @app.post("/api/datasets/upload", status_code=201)
    def upload(file: UploadFile, source_url: str = Form(default=""),
               source: Literal["upload", "synthetic"] = Form(default="upload"), db: Session = Depends(session)):
        raw = file.file.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(413, "Максимальный размер файла — 10 МиБ.")
        try:
            data = parse_file(raw, file.filename or "")
            if source_url:
                data["source_url"] = str(TypeAdapter(HttpUrl).validate_python(source_url))
        except Exception as exc:
            raise HTTPException(422, f"Ошибка чтения файла: {str(exc)[:200]}") from exc
        is_demo = raw == (DEMO_DIR / "GeoLab-01.csv").read_bytes()
        known_synthetic = any(raw == d.original for d in db.scalars(select(Dataset).where(Dataset.source == "synthetic")))
        d = Dataset(source="synthetic" if is_demo or known_synthetic else source, data=data, original=raw)
        db.add(d)
        db.commit()
        return summary(d)

    @app.get("/api/datasets")
    def datasets(db: Session = Depends(session)):
        return [summary(d) for d in db.scalars(select(Dataset).order_by(Dataset.created.desc()))]

    @app.get("/api/datasets/{id}")
    def dataset(id: str, db: Session = Depends(session)):
        return summary(get(db, Dataset, id))

    @app.get("/api/datasets/{id}/curves")
    def curves(id: str, db: Session = Depends(session)):
        return get(db, Dataset, id).data

    @app.get("/api/datasets/{id}/original")
    def original(id: str, db: Session = Depends(session)):
        return Response(get(db, Dataset, id).original, media_type="application/octet-stream")

    @app.delete("/api/datasets/{id}", status_code=204)
    def remove(id: str, db: Session = Depends(session)):
        from sqlalchemy import text
        db.execute(text("BEGIN IMMEDIATE"))
        d = get(db, Dataset, id)
        db.execute(delete(Review).where(Review.analysis_id.in_(select(Analysis.id).where(Analysis.dataset_id == id))))
        db.execute(delete(Analysis).where(Analysis.dataset_id == id))
        db.delete(d)
        db.commit()
        return Response(status_code=204)

    @app.get("/api/analysis")
    def analyses(db: Session = Depends(session)):
        return [describe(a) for a in db.scalars(select(Analysis).order_by(Analysis.created.desc()))]

    @app.post("/api/analysis/run", status_code=201)
    def run(req: RunRequest, db: Session = Depends(session)):
        d = get(db, Dataset, req.dataset_id)
        model = get(db, TrainedModel, req.trained_model_id) if req.trained_model_id else None
        try:
            settings = Settings(**req.model_dump(exclude={"dataset_id", "trained_model_id"}))
            if model and "isolation" not in settings.methods:
                raise ValueError("Для сохранённой модели включите Isolation Forest.")
            if model:
                settings = settings.model_copy(update={"trees": model.metadata_json["trees"],
                                                       "contamination": model.metadata_json["contamination"]})
            a = save_run(db, d, settings, model)
            db.commit()
            return describe(a)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(409, "Скважина была удалена во время анализа. Обновите каталог.") from exc

    @app.get("/api/analysis/{id}")
    def analysis(id: str, db: Session = Depends(session)):
        return describe(get(db, Analysis, id))

    @app.get("/api/analysis/{id}/results")
    def results(id: str, db: Session = Depends(session)):
        return get(db, Analysis, id).result

    @app.get("/api/reports/{id}")
    def report(id: str, db: Session = Depends(session)):
        a = get(db, Analysis, id)
        d = get(db, Dataset, a.dataset_id)
        reviews = reviews_for(db, id)
        return {**describe(a), "well": summary(d), "result": a.result, "limitation": LIMITATION,
                "reviews": reviews, "passport": quality_passport(d, a, reviews),
                "plot": {"depth": d.data["depth"], "curves": {k: d.data["curves"][k] for k in a.settings["curves"]}}}

    @app.get("/api/reports/{id}/summary")
    def export_summary(id: str, db: Session = Depends(session)):
        return Response(passport_text(report(id, db)).encode("utf-8-sig"), media_type="text/plain",
                        headers={"Content-Disposition": 'attachment; filename="GeoCheck-passport.txt"'})

    @app.get("/api/reports/{id}/csv")
    def export_csv(id: str, db: Session = Depends(session)):
        result = get(db, Analysis, id).result
        buffer = io.StringIO()
        reviews = {r["finding_index"]: r for r in reviews_for(db, id)}
        writer = csv.DictWriter(buffer, fieldnames=["finding_number", "method", "curve", "start", "end", "samples", "reason", "score", "review_status", "review_comment", "review_updated"])
        writer.writeheader()
        for index, finding in enumerate(result["findings"]):
            review = reviews.get(index, {})
            row = {**finding, "finding_number": index + 1, "review_status": review.get("status", "pending"),
                   "review_comment": review.get("comment", ""), "review_updated": review.get("updated", "")}
            writer.writerow({k: spreadsheet_safe(v) for k, v in row.items()})
        return Response(buffer.getvalue().encode("utf-8-sig"), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="findings.csv"'})

    attach_routes(app, session, get, summary, save_run, Settings)
    dist = ROOT / "frontend" / "dist"
    if (dist / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        def workstation():
            return FileResponse(dist / "index.html")

        for route in ["/", "/data", "/viewer", "/quality", "/reports", "/models", "/sources"]:
            app.add_api_route(route, workstation, include_in_schema=False)
    return app


app = create_app(seed=False)

