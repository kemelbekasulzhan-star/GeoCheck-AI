import { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileBarChart2,
  Layers3,
  TriangleAlert,
} from "lucide-react";
import { date, fmt, Model, Run, useApi, Well, Logs, Result } from "../api";
import { Panel, Source } from "../components/ui";
import { LogPlot } from "../components/LogPlot";
export function Overview({
  wells,
  runs,
  models,
  select,
  empty,
}: {
  wells: Well[];
  runs: Run[];
  models: Model[];
  select: (id: string) => void;
  empty: ReactNode;
}) {
  const focus = runs[0],
    well = wells.find((w) => w.id === focus?.dataset_id) ?? wells[0];
  const logs = useApi<Logs>("/datasets/" + well?.id + "/curves", !!well);
  const results = useApi<Result>(
    "/analysis/" + focus?.id + "/results",
    !!focus,
  );
  const latest = wells.flatMap(
    (w) => runs.find((r) => r.dataset_id === w.id) ?? [],
  );
  const pending = latest.reduce((s, r) => s + r.count, 0);
  const stats = [
    {
      label: "Скважины в проекте",
      value: wells.length,
      sub:
        wells.filter((w) => w.source === "synthetic").length + " синтетических",
      icon: Database,
      tone: "teal",
    },
    {
      label: "Проверено скважин",
      value: latest.length,
      sub: wells.length - latest.length + " ожидают анализа",
      icon: CheckCircle2,
      tone: "blue",
    },
    {
      label: "Найденные интервалы",
      value: pending,
      sub: "по последним проверкам",
      icon: TriangleAlert,
      tone: "amber",
    },
    {
      label: "Обученные модели",
      value: models.length,
      sub: models.length
        ? "версии сохранены локально"
        : "создайте первый эксперимент",
      icon: BrainCircuit,
      tone: "purple",
    },
  ];
  return (
    <>
      <div className="metrics">
        {stats.map((s) => (
          <div className="metric" key={s.label}>
            <div className="metric-label">
              {s.label}
              <span className={"metric-icon " + s.tone}>
                <s.icon size={17} />
              </span>
            </div>
            <strong>{fmt(s.value)}</strong>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>
      {!wells.length ? (
        empty
      ) : (
        <>
          <div className="overview-columns">
            <Panel
              title="Скважины проекта"
              action={
                <Link to="/data">
                  Каталог <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="panel-description">
                Откройте скважину, чтобы исследовать измерения и проверить
                замечания.
              </div>
              <div className="well-cards">
                {wells.slice(0, 5).map((w) => {
                  const run = runs.find((r) => r.dataset_id === w.id);
                  return (
                    <Link
                      key={w.id}
                      onClick={() => select(w.id)}
                      to="/viewer"
                      className="well-card"
                    >
                      <span className="well-symbol">
                        <Layers3 size={21} />
                      </span>
                      <div className="well-card-main">
                        <strong>{w.name}</strong>
                        <span>
                          {fmt(w.start)}–{fmt(w.end)} {w.depth_unit || "ед. ?"}{" "}
                          <i /> {Object.keys(w.units).length} каналов
                        </span>
                      </div>
                      <div className="well-card-status">
                        <Source well={w} />
                        <small className={run?.count ? "warning-text" : ""}>
                          {run ? run.count + " интервалов" : "Ожидает проверки"}
                        </small>
                      </div>
                      <ArrowUpRight size={17} />
                    </Link>
                  );
                })}
              </div>
            </Panel>
            <section className="model-promo">
              <div className="promo-icon">
                <BrainCircuit size={25} />
              </div>
              <span className="eyebrow">ОБУЧЕНИЕ НА ВАШИХ ДАННЫХ</span>
              <h2>
                {models.length
                  ? "От модели к новому анализу"
                  : "Создайте свою модель"}
              </h2>
              <p>
                Соберите выборку скважин, обучите Isolation Forest и оцените
                результат на отдельном наборе.
              </p>
              <div className="training-steps">
                <span>
                  <i />
                  Выбор скважин
                </span>
                <span>
                  <i />
                  Обучение и проверка
                </span>
                <span>
                  <i />
                  Применение к новым данным
                </span>
              </div>
              <Link className="primary" to="/models">
                {models.length ? "Открыть модели" : "Новый эксперимент"}
                <ArrowRight size={16} />
              </Link>
              <small>Все вычисления выполняются локально</small>
            </section>
          </div>
          <div className="overview-columns bottom-columns">
            <Panel
              title={"Каротаж · " + well?.name}
              action={
                <Link to="/viewer" onClick={() => well && select(well.id)}>
                  Исследовать <ArrowUpRight size={14} />
                </Link>
              }
            >
              {well && logs.data && (
                <LogPlot
                  data={logs.data}
                  channels={Object.keys(well.units).slice(0, 4)}
                  unit={well.depth_unit}
                  findings={results.data?.findings}
                />
              )}
              <div className="foot">
                <span className="legend-warning" />
                Подсветка отмечает интервалы для экспертной проверки
              </div>
            </Panel>
            <Panel
              title="Последние анализы"
              action={
                <Link to="/reports">
                  <ArrowUpRight size={16} />
                </Link>
              }
            >
              <div className="recent-runs">
                {runs.slice(0, 4).map((r) => (
                  <Link
                    to={"/reports?run=" + r.id}
                    key={r.id}
                    className="recent-run"
                  >
                    <span className="run-icon">
                      <FileBarChart2 size={17} />
                    </span>
                    <div>
                      <strong>
                        {wells.find((w) => w.id === r.dataset_id)?.name}
                      </strong>
                      <p>
                        {r.count} интервалов ·{" "}
                        {r.model ? "Обученная модель" : "Локальная проверка"}
                      </p>
                      <small>{date(r.created)}</small>
                    </div>
                    <Chevron />
                  </Link>
                ))}
                {!runs.length && (
                  <div className="empty">
                    Запустите проверку в разделе анализа скважины.
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
function Chevron() {
  return <ArrowUpRight size={14} />;
}
