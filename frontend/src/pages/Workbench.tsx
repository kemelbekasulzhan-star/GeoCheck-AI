import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Expand,
  MessageSquare,
  Play,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  api,
  date,
  Finding,
  fmt,
  Logs,
  methods,
  Model,
  post,
  Result,
  Review,
  Run,
  useApi,
  Well,
} from "../api";
import { Panel, Source } from "../components/ui";
import { LogPlot } from "../components/LogPlot";
import { Assistant } from "../components/Assistant";
export function Workbench({
  well,
  data,
  runs,
  models,
}: {
  well: Well;
  data: Logs;
  runs: Run[];
  models: Model[];
}) {
  const cache = useQueryClient();
  const [params] = useSearchParams();
  const [runId, setRunId] = useState(params.get("run") ?? ""),
    [modelId, setModelId] = useState(""),
    [channels, setChannels] = useState(Object.keys(well.units).slice(0, 5));
  const [usedMethods, setUsedMethods] = useState(Object.keys(methods)),
    [filter, setFilter] = useState("all"),
    [status, setStatus] = useState("all");
  const [range, setRange] = useState([well.start, well.end]),
    [marks, setMarks] = useState(true),
    [selected, setSelected] = useState(0),
    [limit, setLimit] = useState(50);
  const [depthError, setDepthError] = useState("");
  const run = runs.find((r) => r.id === runId) ?? runs[0],
    selectedModel = models.find((m) => m.id === modelId);
  const results = useApi<Result>("/analysis/" + run?.id + "/results", !!run),
    reviews = useApi<Review[]>("/analysis/" + run?.id + "/reviews", !!run);
  const findings = results.data?.findings ?? [],
    decisions = reviews.data ?? [];
  const item = findings[selected],
    decision = decisions.find((r) => r.finding_index === selected);
  const compatible = models.filter((m) =>
    m.curves.every(
      (c) =>
        well.units[c]?.trim().toLowerCase() === m.units[c].trim().toLowerCase(),
    ),
  );
  const mutation = useMutation({
    mutationFn: (f: FormData) =>
      post<Run>("/analysis/run", {
        dataset_id: well.id,
        curves: selectedModel?.curves ?? channels,
        methods: usedMethods,
        threshold: Number(f.get("threshold")),
        trees: selectedModel?.trees ?? Number(f.get("trees")),
        contamination:
          selectedModel?.contamination ?? Number(f.get("contamination")),
        trained_model_id: modelId || null,
      }),
    onSuccess: async (r) => {
      await cache.invalidateQueries({ queryKey: ["/analysis"] });
      setRunId(r.id);
      setSelected(0);
      setFilter("all");
      setStatus("all");
    },
  });
  function focus(f: Finding, index: number) {
    setSelected(index);
    const margin = Math.max(
      (f.end - f.start) * 2,
      (well.end - well.start) * 0.035,
    );
    setRange([
      Math.max(well.start, f.start - margin),
      Math.min(well.end, f.end + margin),
    ]);
    document
      .querySelector(".analysis-layout")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const visible = findings
    .map((f, index) => ({ f, index }))
    .filter(
      ({ f, index }) =>
        (filter === "all" || f.method === filter) &&
        (status === "all" ||
          (decisions.find((d) => d.finding_index === index)?.status ??
            "pending") === status),
    );
  return (
    <>
      <div className="well-header">
        <div>
          <span className="well-symbol">
            <Activity size={23} />
          </span>
          <div>
            <h2>{well.name}</h2>
            <p>
              {fmt(well.start)}–{fmt(well.end)} {well.depth_unit || "ед. ?"}{" "}
              <span>·</span> {fmt(well.rows)} отсчётов <span>·</span>{" "}
              {Object.keys(well.units).length} каналов
            </p>
          </div>
        </div>
        <Source well={well} />
        <a
          className="button"
          href={"/api/datasets/" + well.id + "/original"}
          download={well.filename}
        >
          <Download size={15} />
          Исходный файл
        </a>
      </div>
      <div className="analysis-layout">
        <div className="log-panel">
          <Panel
            title="Каротажные кривые"
            action={
              <span className="hint">
                Глубина увеличивается вниз <ArrowDown size={13} />
              </span>
            }
          >
            <div className="curve-toggles">
              {Object.keys(well.units).map((c, i) => (
                <label
                  key={c}
                  style={
                    {
                      "--track-color": "var(--curve-" + (i % 5) + ")",
                    } as React.CSSProperties
                  }
                >
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={() =>
                      setChannels(
                        channels.includes(c)
                          ? channels.filter((x) => x !== c)
                          : [...channels, c],
                      )
                    }
                  />
                  <i />
                  {c}
                  <small>{well.units[c] || "ед. ?"}</small>
                </label>
              ))}
            </div>
            <form
              className="depth-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  a = Number(f.get("from")),
                  b = Number(f.get("to"));
                if (a >= b) {
                  setDepthError("Начало интервала должно быть меньше конца.");
                  return;
                }
                setDepthError("");
                setRange([a, b]);
              }}
              key={range.join(",")}
            >
              <label>
                От
                <input
                  required
                  name="from"
                  type="number"
                  step="any"
                  min={well.start}
                  max={well.end}
                  defaultValue={range[0]}
                />
              </label>
              <label>
                До
                <input
                  required
                  name="to"
                  type="number"
                  step="any"
                  min={well.start}
                  max={well.end}
                  defaultValue={range[1]}
                />
              </label>
              <span>{well.depth_unit || "ед. ?"}</span>
              <button title="Применить диапазон">
                <Check size={15} />
                <span>Применить</span>
              </button>
              <button
                type="button"
                className="iconbtn"
                aria-label="Весь интервал"
                onClick={() => setRange([well.start, well.end])}
              >
                <Expand size={16} />
              </button>
              <label className="mark-toggle">
                <input
                  type="checkbox"
                  checked={marks}
                  onChange={(e) => setMarks(e.target.checked)}
                />
                Подсветка
              </label>
            </form>
            {depthError && <p role="alert">{depthError}</p>}
            <div className="scroll">
              <div style={{ minWidth: channels.length * 110 }}>
                <LogPlot
                  large
                  data={data}
                  channels={channels}
                  unit={well.depth_unit}
                  findings={marks ? findings : undefined}
                  range={range}
                />
              </div>
            </div>
            <div className="foot">
              <span className="legend-warning" />
              Подозрительные интервалы <span className="spacer" />
              Выделите область для увеличения · двойной щелчок для сброса
            </div>
          </Panel>
        </div>
        <div className="analysis-side">
          <Panel
            title="Запуск анализа"
            action={<SlidersHorizontal size={17} />}
          >
            <form
              className="formbody"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate(new FormData(e.currentTarget));
              }}
            >
              <label className="field">
                Метод анализа
                <select
                  value={modelId}
                  onChange={(e) => {
                    setModelId(e.target.value);
                    const m = models.find((x) => x.id === e.target.value);
                    if (m) {
                      setChannels(m.curves);
                      if (!usedMethods.includes("isolation"))
                        setUsedMethods([...usedMethods, "isolation"]);
                    }
                  }}
                >
                  <option value="">Проверка текущей скважины</option>
                  {compatible.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                {selectedModel
                  ? "Применяются сохранённые деревья, медианы и масштабы. Каналы модели: " +
                    selectedModel.curves.join(", ")
                  : "Isolation Forest обучается на выбранных каналах этой скважины. Для сохранённой модели откройте раздел обучения."}
              </p>
              <details className="advanced">
                <summary>
                  Методы и параметры <ChevronDown size={14} />
                </summary>
                <div className="method-checks">
                  {Object.entries(methods).map(([k, v]) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={usedMethods.includes(k)}
                        disabled={!!selectedModel && k === "isolation"}
                        onChange={() =>
                          setUsedMethods(
                            usedMethods.includes(k)
                              ? usedMethods.filter((x) => x !== k)
                              : [...usedMethods, k],
                          )
                        }
                      />
                      {v}
                    </label>
                  ))}
                </div>
                <label className="field">
                  Порог MAD
                  <input
                    name="threshold"
                    required
                    type="number"
                    defaultValue={4.5}
                    min={2}
                    max={15}
                    step={0.1}
                  />
                </label>
                <label className="field">
                  Деревья IF
                  <input
                    name="trees"
                    type="number"
                    required
                    defaultValue={150}
                    min={10}
                    max={300}
                    disabled={!!selectedModel}
                  />
                </label>
                <label className="field">
                  Доля аномалий IF
                  <input
                    name="contamination"
                    required
                    type="number"
                    defaultValue={0.025}
                    min={0.001}
                    max={0.5}
                    step={0.001}
                    disabled={!!selectedModel}
                  />
                </label>
              </details>
              <button
                className="primary full"
                disabled={
                  mutation.isPending ||
                  !channels.length ||
                  !usedMethods.length ||
                  channels.length > 32
                }
              >
                <Play size={15} />
                {mutation.isPending ? "Вычисление…" : "Запустить анализ"}
              </button>
              {mutation.error && <p role="alert">{mutation.error.message}</p>}
              {mutation.isSuccess && (
                <p className="success-text" role="status">
                  <Check size={13} />
                  Анализ сохранён
                </p>
              )}
            </form>
          </Panel>
          <Panel
            title="Проверка интервала"
            action={<MessageSquare size={16} />}
          >
            {item && run ? (
              <div className="formbody">
                <div className="finding-kicker">{methods[item.method]}</div>
                <h3 className="interval-title">
                  {fmt(item.start)}–{fmt(item.end)}{" "}
                  <small>{well.depth_unit}</small>
                </h3>
                <span className="chip">{item.curve}</span>
                <p className="finding-reason">{item.reason}</p>
                <div className="key-value">
                  <span>Отсчётов в интервале</span>
                  <b>{item.samples}</b>
                </div>
                {item.score !== null && (
                  <div className="key-value">
                    <span>Оценка аномальности</span>
                    <b>{item.score.toFixed(3)}</b>
                  </div>
                )}
                <p className="hint">
                  Экспертная отметка сохраняется отдельно от результата
                  алгоритма.
                </p>
                <ReviewEditor
                  key={run.id + "-" + selected + "-" + decision?.updated}
                  runId={run.id}
                  index={selected}
                  review={decision}
                />
              </div>
            ) : (
              <div className="empty compact">
                <Check size={26} />
                <p>
                  {run
                    ? "Замечаний для проверки нет"
                    : "Запустите анализ для поиска интервалов"}
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
      {run && (
        <Assistant
          key={run.id + ":" + selected}
          runId={run.id}
          index={item ? selected : undefined}
        />
      )}
      <Panel
        title="Результаты и замечания"
        action={
          run ? (
            <Link to={"/reports?run=" + run.id}>
              Отчёт <ArrowUpRight size={14} />
            </Link>
          ) : undefined
        }
      >
        <div className="results-toolbar">
          <label>
            Запуск
            <select
              aria-label="Выбор анализа"
              value={run?.id ?? ""}
              onChange={(e) => {
                setRunId(e.target.value);
                setSelected(0);
              }}
            >
              {!runs.length && <option value="">Нет анализов</option>}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {date(r.created)} · {r.count} интервалов
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select
              aria-label="Статус замечания"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setLimit(50);
              }}
            >
              <option value="all">Все решения</option>
              <option value="pending">Ожидают проверки</option>
              <option value="confirmed">Подтверждено</option>
              <option value="dismissed">Отклонено</option>
            </select>
          </label>
          <span className="spacer" />
          <span className="hint">{visible.length} интервалов</span>
        </div>
        <div className="method-tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            Все <b>{findings.length}</b>
          </button>
          {Object.entries(methods).map(([k, v]) => (
            <button
              key={k}
              className={filter === k ? "active" : ""}
              onClick={() => {
                setFilter(k);
                setLimit(50);
              }}
            >
              {v}
              <b>{findings.filter((f) => f.method === k).length}</b>
            </button>
          ))}
        </div>
        {(results.error || reviews.error) && (
          <p role="alert">{results.error?.message ?? reviews.error?.message}</p>
        )}
        <div className="scroll">
          <table className="findings-table">
            <thead>
              <tr>
                <th>Глубина, {well.depth_unit || "ед. ?"}</th>
                <th>Канал</th>
                <th>Метод</th>
                <th>Причина</th>
                <th>Решение</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map(({ f, index }) => {
                const decision =
                  decisions.find((r) => r.finding_index === index)?.status ??
                  "pending";
                return (
                  <tr
                    key={index}
                    className={selected === index ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="textbtn mono"
                        onClick={() => focus(f, index)}
                      >
                        {fmt(f.start)}–{fmt(f.end)}
                      </button>
                    </td>
                    <td className="mono">{f.curve}</td>
                    <td>{methods[f.method]}</td>
                    <td>{f.reason}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (decision === "pending"
                            ? "sand"
                            : decision === "dismissed"
                              ? "neutral"
                              : "")
                        }
                      >
                        {decision === "pending"
                          ? "На проверку"
                          : decision === "confirmed"
                            ? "Подтверждено"
                            : "Отклонено"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="iconbtn"
                        aria-label={"Исследовать интервал " + index}
                        onClick={() => focus(f, index)}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="empty">
            {results.isFetching
              ? "Загрузка результатов…"
              : "По выбранным фильтрам замечаний нет."}
          </p>
        )}
        {visible.length > limit && (
          <button className="load-more" onClick={() => setLimit(limit + 50)}>
            Показать ещё 50
          </button>
        )}
        <div className="foot">
          Статистические отклонения требуют интерпретации с учётом геологии.{" "}
          {run?.notes.join(" ")}
        </div>
      </Panel>
    </>
  );
}
function ReviewEditor({
  runId,
  index,
  review,
}: {
  runId: string;
  index: number;
  review?: Review;
}) {
  const commentId = useId();
  const cache = useQueryClient(),
    [comment, setComment] = useState(review?.comment ?? "");
  const save = useMutation({
    mutationFn: (status: Review["status"]) =>
      api<Review[]>("/analysis/" + runId + "/reviews/" + index, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: ["/analysis/" + runId + "/reviews"],
      });
      void cache.invalidateQueries({ queryKey: ["/reports/" + runId] });
    },
  });
  return (
    <>
      <div className="field">
        <label htmlFor={commentId}>Комментарий</label>
        <textarea
          id={commentId}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например, подтверждено по повторному замеру"
          rows={3}
        />
      </div>
      <div className="review-actions">
        <button
          disabled={save.isPending}
          onClick={() => save.mutate("confirmed")}
        >
          <Check size={14} />
          Подтвердить
        </button>
        <button
          disabled={save.isPending}
          onClick={() => save.mutate("dismissed")}
        >
          <X size={14} />
          Отклонить
        </button>
      </div>
      {review && (
        <div className="hint review-status">
          Сохранено ·{" "}
          {review.status === "confirmed"
            ? "подтверждено"
            : review.status === "dismissed"
              ? "отклонено"
              : "на проверке"}
          <button
            className="textbtn"
            disabled={save.isPending}
            onClick={() => save.mutate("pending")}
          >
            Вернуть на проверку
          </button>
        </div>
      )}
      <button
        className="textbtn comment-save"
        disabled={save.isPending}
        onClick={() => save.mutate(review?.status ?? "pending")}
      >
        Сохранить комментарий
      </button>
      {save.error && <p role="alert">{save.error.message}</p>}
    </>
  );
}
