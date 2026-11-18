"""Saved, reproducible model fitting with a well-level holdout."""
import hashlib
import io
import json
import time

import joblib
import numpy as np
import sklearn
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

from .ml import fit_forest
from .schemas import Settings


class TrainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    train_ids: list[str] = Field(min_length=1, max_length=30)
    test_ids: list[str] = Field(min_length=1, max_length=30)
    curves: list[str] = Field(min_length=1, max_length=32)
    trees: int = Field(default=150, ge=10, le=300)
    contamination: float = Field(default=0.025, gt=0, le=0.5)

    @model_validator(mode="after")
    def distinct(self):
        if not self.name.strip():
            raise ValueError("Введите название модели.")
        if len(set(self.train_ids + self.test_ids)) != len(self.train_ids + self.test_ids):
            raise ValueError("Разделите обучение и проверку по разным скважинам.")
        if len(set(self.curves)) != len(self.curves):
            raise ValueError("Повторяющиеся каналы.")
        return self


def fingerprint(data):
    content = {"depth": data["depth"], "curves": data["curves"]}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


def matrix(data, curves, units):
    for key in curves:
        channel = data["curves"].get(key)
        if channel is None:
            raise ValueError(f'{data["name"]}: отсутствует канал {key}.')
        if not channel["unit"].strip() or channel["unit"].strip().casefold() != units[key].strip().casefold():
            raise ValueError(f'{data["name"]}: проверьте единицы {key}; ожидается {units[key] or "указанная единица"}.')
    return np.array([data["curves"][key]["values"] for key in curves], dtype=float).T


def snapshot(dataset):
    return {"id": dataset.id, "name": dataset.data["name"], "source": dataset.source,
            "source_url": dataset.data.get("source_url"),
            "rows": len(dataset.data["depth"]), "sha256": fingerprint(dataset.data)}


def fit_saved(train, test, req):
    started = time.perf_counter()
    if sum(len(d.data["depth"]) for d in train + test) > 500_000:
        raise ValueError("Для одного локального эксперимента допустимо до 500 000 строк.")
    if {fingerprint(d.data) for d in train} & {fingerprint(d.data) for d in test}:
        raise ValueError("В проверку попала копия обучающих данных.")
    if {d.data["name"].strip().casefold() for d in train} & {d.data["name"].strip().casefold() for d in test}:
        raise ValueError("Одна скважина встречается в обучении и проверке. Проверьте идентичность скважин.")
    units = {key: train[0].data["curves"].get(key, {}).get("unit", "") for key in req.curves}
    arrays = [matrix(d.data, req.curves, units) for d in train]
    values = np.concatenate(arrays)
    usable = np.isfinite(values).any(axis=1)
    values = values[usable]
    if len(values) < 8 or not np.isfinite(values).any(axis=0).all():
        raise ValueError("Требуется минимум 8 строк и измерения в каждом выбранном канале.")
    settings = Settings(curves=req.curves, trees=req.trees, contamination=req.contamination)
    pipeline = fit_forest(values, settings)
    evaluation = []
    for dataset in test:
        x = matrix(dataset.data, req.curves, units)
        valid = np.isfinite(x).any(axis=1)
        if not valid.any():
            raise ValueError(f'{dataset.data["name"]}: нет измерений для проверки.')
        predictions = pipeline.predict(x[valid]) == -1
        item = {**snapshot(dataset), "scored_rows": int(valid.sum()),
                "excluded_rows": int((~valid).sum()), "flagged_rows": int(predictions.sum()), "metrics": None}
        # Ground truth is attached only to known generated data, never inferred from detector output.
        if dataset.source == "synthetic" and "truth" in dataset.data:
            depth = np.array(dataset.data["depth"])[valid]
            truth = np.zeros(len(depth), dtype=bool)
            for interval in dataset.data["truth"]:
                if interval["curve"].split(" [")[0] in req.curves:
                    truth |= (depth >= interval["start"]) & (depth <= interval["end"])
            precision, recall, f1, _ = precision_recall_fscore_support(truth, predictions, average="binary", zero_division=0)
            tn, fp, fn, tp = confusion_matrix(truth, predictions, labels=[False, True]).ravel()
            item["metrics"] = dict(precision=float(precision), recall=float(recall), f1=float(f1),
                                   tp=int(tp), fp=int(fp), fn=int(fn), tn=int(tn), label_source="synthetic")
        evaluation.append(item)
    stream = io.BytesIO()
    joblib.dump(pipeline, stream, compress=3)
    metadata = {"algorithm": "Isolation Forest", "algorithm_version": "2.0", "sklearn": sklearn.__version__,
                "curves": req.curves, "units": units, "trees": req.trees, "contamination": req.contamination,
                "seed": 42, "train": [snapshot(d) for d in train], "evaluation": evaluation,
                "train_rows": len(values), "excluded_train_rows": int((~usable).sum()),
                "duration_seconds": round(time.perf_counter() - started, 3),
                "preprocessing": ["median imputation", "StandardScaler"],
                "data_scope": "synthetic" if all(d.source == "synthetic" for d in train + test) else "user"}
    return metadata, stream.getvalue()


def load_saved(model, dataset, curves):
    meta = model.metadata_json
    if meta["sklearn"] != sklearn.__version__:
        raise ValueError("Версия scikit-learn изменилась. Обучите новую версию модели.")
    if curves != meta["curves"]:
        raise ValueError("Состав и порядок каналов должны совпадать с выбранной моделью.")
    matrix(dataset.data, curves, meta["units"])
    # Only server-generated artifacts from the local database can reach this deserializer.
    return joblib.load(io.BytesIO(model.artifact))

