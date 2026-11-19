import { Link } from "react-router-dom";
import { Download, ClipboardCheck } from "lucide-react";
import { fmt, methods } from "../api";
import { Panel } from "./ui";

export interface Passport {
  original_sha256: string;
  samples: number;
  affected_samples: number;
  affected_percent: number;
  missing_values: number;
  unknown_units: string[];
  depth_unit_known: boolean;
  method_counts: Record<string, number>;
  review: { confirmed: number; dismissed: number; pending: number };
  stage: "awaiting_review" | "reviewed" | "no_findings";
  next_steps: string[];
  basis: string;
}

export function QualityPassport({
  value: p,
  runId,
}: {
  value: Passport;
  runId: string;
}) {
  return (
    <Panel title="Паспорт проверки" action={<ClipboardCheck size={20} />}>
      <div className="formbody quality-passport">
        <span className="chip">
          {p.stage === "awaiting_review"
            ? "Ожидает экспертной проверки"
            : p.stage === "reviewed"
              ? "Замечания рассмотрены"
              : "Предупреждений не найдено"}
        </span>
        <div className="passport-metrics">
          <div>
            <strong>{fmt(p.affected_percent)}%</strong>
            <span>отсчётов с предупреждениями</span>
            <small>
              {fmt(p.affected_samples)} из {fmt(p.samples)} · без повторного
              счёта пересечений
            </small>
          </div>
          <div>
            <strong>{p.review.pending}</strong>
            <span>замечаний ждут решения</span>
            <small>
              Подтверждено {p.review.confirmed} · отклонено {p.review.dismissed}
            </small>
          </div>
          <div>
            <strong>{fmt(p.missing_values)}</strong>
            <span>пропущенных значений</span>
            <small>В каналах этого анализа</small>
          </div>
        </div>
        <div className="checks">
          {Object.entries(p.method_counts).map(([method, count]) => (
            <span className="chip" key={method}>
              {methods[method]} · {count}
            </span>
          ))}
        </div>
        <h3>Что проверить дальше</h3>
        <ul>
          {p.next_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <p className="muted">{p.basis}</p>
        <details>
          <summary>Идентификатор исходного файла</summary>
          <p className="file-hash">SHA-256: {p.original_sha256}</p>
          <p>
            Помогает сверить, что анализ относится к тому же исходному файлу.
          </p>
        </details>
        <div className="actions">
          <a className="button" href={`/api/reports/${runId}/summary`} download>
            <Download size={15} /> Скачать паспорт TXT
          </a>
          <Link className="button" to={`/viewer?run=${runId}`}>
            Проверить интервалы →
          </Link>
        </div>
      </div>
    </Panel>
  );
}
