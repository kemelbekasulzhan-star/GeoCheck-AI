import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  FlaskConical,
  Play,
  Plus,
} from "lucide-react";
import { date, fmt, Model, post, Well } from "../api";
import { Panel, Source } from "../components/ui";
export function Models({ wells, models }: { wells: Well[]; models: Model[] }) {
  const cache = useQueryClient();
  const [creating, setCreating] = useState(!models.length),
    [selected, setSelected] = useState("");
  const [roles, setRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      wells.filter((w) => w.demo_role).map((w) => [w.id, w.demo_role!]),
    ),
  );
  const candidates = wells.filter((w) => roles[w.id]);
  const shared = candidates.length
    ? Object.keys(candidates[0].units).filter((c) =>
        candidates.every(
          (w) =>
            w.units[c] &&
            w.units[c].trim().toLowerCase() ===
              candidates[0].units[c].trim().toLowerCase(),
        ),
      )
    : [];
  const [excluded, setExcluded] = useState<string[]>([]);
  const curves = shared.filter((c) => !excluded.includes(c));
  const [name, setName] = useState("Модель контроля качества");
  const train = useMutation({
    mutationFn: (f: FormData) =>
      post<Model>("/models/train", {
        name,
        train_ids: wells
          .filter((w) => roles[w.id] === "train")
          .map((w) => w.id),
        test_ids: wells.filter((w) => roles[w.id] === "test").map((w) => w.id),
        curves,
        trees: Number(f.get("trees")),
        contamination: Number(f.get("contamination")),
      }),
    onSuccess: async (model) => {
      await cache.invalidateQueries({ queryKey: ["/models"] });
      setSelected(model.id);
      setCreating(false);
    },
  });
  const active = models.find((m) => m.id === selected) ?? models[0];
  const trainingCount = wells.filter((w) => roles[w.id] === "train").length,
    testingCount = wells.filter((w) => roles[w.id] === "test").length;
  return (
    <>
      <div className="section-toolbar">
        <div className="tabs">
          <button
            className={!creating ? "active" : ""}
            onClick={() => setCreating(false)}
          >
            Реестр моделей <span>{models.length}</span>
          </button>
          <button
            className={creating ? "active" : ""}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} />
            Новый эксперимент
          </button>
        </div>
        <span className="badge">
          <span className="dot" />
          Локальное обучение
        </span>
      </div>
      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            train.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="model-layout">
            <div>
              <Panel title="Обучающая и проверочная выборки">
                <div className="formbody">
                  <p className="muted">
                    Назначьте каждой скважине роль. Проверочная выборка
                    оценивается после обучения.
                  </p>
                  <label className="field">
                    Название эксперимента
                    <input
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например, контроль ГИС — пилот"
                    />
                  </label>
                </div>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Скважина</th>
                        <th>Источник</th>
                        <th>Отсчёты</th>
                        <th>Роль в эксперименте</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wells.map((w) => (
                        <tr key={w.id}>
                          <td>
                            <b>{w.name}</b>
                            <small>{Object.keys(w.units).join(" · ")}</small>
                          </td>
                          <td>
                            <Source well={w} />
                          </td>
                          <td className="mono">{fmt(w.rows)}</td>
                          <td>
                            <select
                              aria-label={"Роль " + w.name}
                              value={roles[w.id] ?? ""}
                              onChange={(e) =>
                                setRoles({ ...roles, [w.id]: e.target.value })
                              }
                            >
                              <option value="">Не включать</option>
                              <option value="train">Обучение</option>
                              <option value="test">Проверка</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!wells.length && (
                  <p className="empty">
                    Загрузите данные или восстановите демо через боковую панель.
                  </p>
                )}
                <div className="selection-summary">
                  <span>
                    Обучение <b>{trainingCount}</b>
                  </span>
                  <span>
                    Проверка <b>{testingCount}</b>
                  </span>
                  <span>
                    Общих каналов <b>{curves.length}</b>
                  </span>
                </div>
              </Panel>
              <Panel title="Признаки и подготовка">
                <div className="formbody">
                  <p className="muted">
                    Доступны общие каналы с одинаковыми указанными единицами.
                  </p>
                  <div className="checks">
                    {shared.map((c) => (
                      <label key={c}>
                        <input
                          type="checkbox"
                          checked={!excluded.includes(c)}
                          onChange={() =>
                            setExcluded(
                              excluded.includes(c)
                                ? excluded.filter((x) => x !== c)
                                : [...excluded, c],
                            )
                          }
                        />
                        {c}
                        <small>{candidates[0]?.units[c]}</small>
                      </label>
                    ))}
                  </div>
                  {!shared.length && (
                    <p className="hint">
                      Выберите совместимые скважины в таблице выше.
                    </p>
                  )}
                  <div className="pipeline">
                    <span>Медиана пропусков</span>
                    <ChevronDown size={14} />
                    <span>Масштабирование</span>
                    <ChevronDown size={14} />
                    <span>Isolation Forest</span>
                  </div>
                  <p className="hint">
                    Параметры подготовки вычисляются только по обучающей
                    выборке. Полностью пустые строки исключаются.
                  </p>
                </div>
              </Panel>
            </div>
            <Panel title="Параметры модели">
              <div className="formbody">
                <div className="algorithm-card">
                  <BrainCircuit size={23} />
                  <div>
                    <strong>Isolation Forest</strong>
                    <p>Обнаружение необычных комбинаций измерений</p>
                  </div>
                </div>
                <label className="field">
                  Количество деревьев
                  <input
                    name="trees"
                    type="number"
                    defaultValue={150}
                    min={10}
                    max={300}
                    required
                  />
                </label>
                <label className="field">
                  Ожидаемая доля аномалий
                  <input
                    name="contamination"
                    type="number"
                    defaultValue={0.025}
                    min={0.001}
                    max={0.5}
                    step={0.001}
                    required
                  />
                  <small>
                    Определяет порог обнаружения на обучающих данных.
                  </small>
                </label>
                <div className="key-value">
                  <span>Случайное зерно</span>
                  <b>42</b>
                </div>
                <div className="key-value">
                  <span>Сохранение модели</span>
                  <b>SQLite</b>
                </div>
                <button
                  className="primary full"
                  disabled={
                    !trainingCount ||
                    !testingCount ||
                    !curves.length ||
                    train.isPending
                  }
                >
                  <Play size={15} />
                  {train.isPending ? "Обучение и проверка…" : "Обучить модель"}
                </button>
                {train.isPending && (
                  <p role="status" className="hint">
                    Выполняется расчёт. Дождитесь сохранения результатов.
                  </p>
                )}
                {train.error && <p role="alert">{train.error.message}</p>}
                <p className="hint">
                  Для precision, recall и F1 нужна разметка проверочных
                  измерений. Демо содержит известные искусственные изменения.
                </p>
              </div>
            </Panel>
          </div>
        </form>
      ) : active ? (
        <div className="model-layout">
          <div>
            <Panel
              title="Сохранённые версии"
              action={<span>{models.length}</span>}
            >
              <div className="model-list">
                {models.map((m) => (
                  <button
                    key={m.id}
                    className={
                      "model-row " + (m.id === active.id ? "selected" : "")
                    }
                    onClick={() => setSelected(m.id)}
                  >
                    <span className="metric-icon purple">
                      <BrainCircuit size={21} />
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <small>
                        {date(m.created)} · {m.train.length} скважины ·{" "}
                        {fmt(m.train_rows)} строк
                      </small>
                    </div>
                    <span className="badge">
                      {m.data_scope === "synthetic"
                        ? "Синтетические данные"
                        : "Данные пользователя"}
                    </span>
                    {m.id === active.id && <Check size={17} />}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Проверка на отложенных скважинах">
              <div className="formbody">
                {active.evaluation.map((e) => (
                  <section key={e.id} className="evaluation">
                    <div className="evaluation-head">
                      <h3>{e.name}</h3>
                      <span>
                        {fmt(e.flagged_rows)} / {fmt(e.scored_rows)} строк
                        отмечено
                      </span>
                    </div>
                    {e.metrics ? (
                      <>
                        <div className="score-cards">
                          {(["precision", "recall", "f1"] as const).map((k) => (
                            <div key={k}>
                              <span>
                                {k === "f1"
                                  ? "F1"
                                  : k === "precision"
                                    ? "Precision"
                                    : "Recall"}
                              </span>
                              <b>
                                {(100 * e.metrics![k]).toFixed(1)}
                                <small>%</small>
                              </b>
                            </div>
                          ))}
                        </div>
                        <div className="confusion">
                          <span>
                            Верно отмечено <b>{e.metrics.tp}</b>
                          </span>
                          <span>
                            Ложные срабатывания <b>{e.metrics.fp}</b>
                          </span>
                          <span>
                            Пропущено <b>{e.metrics.fn}</b>
                          </span>
                          <span>
                            Верно без отметки <b>{e.metrics.tn}</b>
                          </span>
                        </div>
                        <p className="hint">
                          Оценка по искусственной разметке. Для применения на
                          месторождении нужна отдельная экспертная проверка.
                        </p>
                      </>
                    ) : (
                      <p className="notice">
                        Разметка отсутствует. Сохранены число срабатываний и
                        объём проверенных измерений.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </Panel>
          </div>
          <Panel title="Паспорт модели">
            <div className="formbody">
              <div className="algorithm-card">
                <FlaskConical size={24} />
                <div>
                  <strong>{active.name}</strong>
                  <p>{active.algorithm}</p>
                </div>
              </div>
              <div className="key-value">
                <span>Деревьев</span>
                <b>{active.trees}</b>
              </div>
              <div className="key-value">
                <span>Доля аномалий</span>
                <b>{active.contamination}</b>
              </div>
              <div className="key-value">
                <span>Время обучения и проверки</span>
                <b>{active.duration_seconds} с</b>
              </div>
              <div className="key-value">
                <span>scikit-learn</span>
                <b>{active.sklearn}</b>
              </div>
              <h3>Входные каналы</h3>
              <div className="checks">
                {active.curves.map((c) => (
                  <span className="chip" key={c}>
                    {c} · {active.units[c]}
                  </span>
                ))}
              </div>
              <h3>Обучающие скважины</h3>
              {active.train.map((w) => (
                <p className="hint" key={w.id}>
                  {w.name} · {fmt(w.rows)} отсчётов
                </p>
              ))}
              <p className="hint">
                Выберите эту версию в разделе «Анализ скважины» для расчёта по
                сохранённой модели.
              </p>
              <a
                className="button full"
                href={"/api/models/" + active.id}
                download={active.id + ".json"}
              >
                Скачать паспорт JSON
              </a>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="empty-state">
          <BrainCircuit size={38} />
          <h2>Создайте первую модель</h2>
          <p>Подготовьте обучающие и проверочные скважины.</p>
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={15} />
            Новый эксперимент
          </button>
        </div>
      )}
    </>
  );
}
