"""Evidence-based summaries. No language model or inferred geological verdicts."""
from bisect import bisect_left, bisect_right
from collections import Counter
from hashlib import sha256

METHOD_NAMES = {"missing": "Пропуски", "physical": "Физические ограничения",
                "outlier": "Статистические выбросы", "jump": "Резкие изменения",
                "isolation": "Isolation Forest"}


def quality_passport(dataset, analysis, reviews):
    data, settings = dataset.data, analysis.settings
    findings = analysis.result["findings"]
    depth = data["depth"]
    affected = bytearray(len(depth))
    for finding in findings:
        start, end = bisect_left(depth, finding["start"]), bisect_right(depth, finding["end"])
        affected[start:end] = b"\x01" * (end - start)
    decisions = Counter(r["status"] for r in reviews)
    pending = len(findings) - decisions["confirmed"] - decisions["dismissed"]
    missing = sum(v is None for k in settings["curves"] for v in data["curves"][k]["values"])
    unknown = [k for k in settings["curves"] if not data["curves"][k]["unit"].strip()]
    next_steps = []
    if not data["depth_unit"].strip() or unknown:
        next_steps.append("Уточните единицы измерений у источника данных: часть физических проверок может быть недоступна.")
    if pending:
        next_steps.append(f"Просмотрите {pending} замечаний без решения и сохраните экспертную оценку.")
    if decisions["confirmed"]:
        next_steps.append("Согласуйте подтверждённые замечания с поставщиком измерений; исходный файл сохранён без изменений.")
    if not findings:
        next_steps.append("Выбранные методы не сформировали предупреждений. Это не подтверждает отсутствие ошибок; проверьте покрытие и настройки.")
    if not pending and findings:
        next_steps.append("Все замечания рассмотрены. Передайте паспорт вместе с исходными данными и результатами анализа.")
    return {
        "version": "1.0", "original_sha256": sha256(dataset.original).hexdigest(),
        "samples": len(depth), "affected_samples": sum(affected),
        "affected_percent": round(100 * sum(affected) / len(depth), 2),
        "missing_values": missing, "unknown_units": unknown,
        "depth_unit_known": bool(data["depth_unit"].strip()),
        "method_counts": {k: sum(f["method"] == k for f in findings) for k in settings["methods"]},
        "review": {"confirmed": decisions["confirmed"], "dismissed": decisions["dismissed"], "pending": pending},
        "stage": "awaiting_review" if pending else "reviewed" if findings else "no_findings",
        "next_steps": next_steps,
        "basis": "Сводка рассчитана по сохранённому анализу и текущим экспертным отметкам. Процент отражает охват предупреждений, а не вероятность ошибки.",
    }


def passport_text(report):
    p, well = report["passport"], report["well"]
    source = "Синтетические данные" if well["source"] == "synthetic" else "Файл пользователя; происхождение указано пользователем"
    lines = ["GeoCheck AI — паспорт проверки", f"Скважина: {well['name']}",
             f"Источник: {source}", f"Файл: {well['filename']}",
             f"Ссылка источника: {well.get('source_url') or 'Не указана'}",
             f"SHA-256 исходника: {p['original_sha256']}", f"Анализ: {report['id']}",
             f"Дата анализа: {report['created']}",
             f"Глубина: {well['start']}–{well['end']} {well['depth_unit'] or '(единицы неизвестны)'}",
             "Каналы: " + ", ".join(f"{k} [{well['units'][k] or '?'}]" for k in report['settings']['curves']),
             f"Отсчёты с предупреждениями: {p['affected_samples']} / {p['samples']} ({p['affected_percent']}%)",
             f"Пропущено значений в выбранных каналах: {p['missing_values']}",
             f"Решения: подтверждено {p['review']['confirmed']}; отклонено {p['review']['dismissed']}; ожидают {p['review']['pending']}",
             "Методы: " + "; ".join(f"{METHOD_NAMES[k]}: {v}" for k, v in p['method_counts'].items()),
             "Версии: " + str(report['versions']), "Настройки: " + str(report['settings']),
             "Модель: " + (report.get('model') or {}).get('name', 'Локальная проверка текущей скважины'),
             "", "Следующие действия:", *p['next_steps'], "", p['basis'], report['limitation'],
             *report['notes'], "", "Экспертные решения (номера замечаний в CSV начинаются с 1):"]
    for r in report['reviews']:
        lines.append(f"{r['finding_index'] + 1}. {r['status']} | {r['updated']} | {r['comment']}")
    return "\n".join(lines) + "\n"


def spreadsheet_safe(value):
    # CSV quoting does not prevent spreadsheet formula interpretation.
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value
