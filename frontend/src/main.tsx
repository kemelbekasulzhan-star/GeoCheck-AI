import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Database,
  FileBarChart2,
  FolderOpen,
  HardDrive,
  Layers3,
  LayoutDashboard,
  Menu,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Logs, Model, post, Run, useApi, Well } from "./api";
import { Workspace } from "./pages/Workspace";
import { Reports } from "./pages/Research";
import { Workbench } from "./pages/Workbench";
import { Models } from "./pages/Models";
import { Overview } from "./pages/Overview";
import { Sources } from "./pages/Sources";
import "./styles.css";
import "./workspace-theme.css";

const navigation = [
  {
    path: "/",
    name: "Обзор проекта",
    icon: LayoutDashboard,
    subtitle: "Данные, проверки и модели в одном рабочем пространстве.",
  },
  {
    path: "/viewer",
    name: "Анализ скважины",
    icon: Activity,
    subtitle: "Исследуйте каротаж и проверяйте выводы алгоритмов.",
  },
  {
    path: "/data",
    name: "Каталог данных",
    icon: Database,
    subtitle: "Скважины, исходные измерения и контроль формата.",
  },
  {
    path: "/models",
    name: "Модели и обучение",
    icon: BrainCircuit,
    subtitle: "От обучающей выборки до проверки на новых скважинах.",
  },
  {
    path: "/reports",
    name: "Отчёты",
    icon: FileBarChart2,
    subtitle: "Воспроизводимые результаты с параметрами и версиями моделей.",
  },
  {
    path: "/sources",
    name: "Источники данных",
    icon: BookOpen,
    subtitle:
      "Происхождение данных и опубликованные материалы для исследования.",
  },
];
function App() {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(
      () => localStorage.getItem("geocheck-well") ?? "",
    ),
    [search, setSearch] = useState("");
  const location = useLocation(),
    cache = useQueryClient();
  const page =
    navigation.find((p) => p.path === location.pathname) ?? navigation[0];
  const health = useApi<{ status: string }>("/health"),
    datasets = useApi<Well[]>("/datasets"),
    analyses = useApi<Run[]>("/analysis"),
    models = useApi<Model[]>("/models");
  const wells = datasets.data ?? [],
    runs = analyses.data ?? [],
    trained = models.data ?? [];
  const requestedRunId =
    location.pathname === "/viewer"
      ? new URLSearchParams(location.search).get("run")
      : null;
  const requestedRun = runs.find((r) => r.id === requestedRunId);
  const well =
    wells.find((w) => w.id === (requestedRun?.dataset_id ?? selected)) ??
    wells[0];
  const logs = useApi<Logs>("/datasets/" + well?.id + "/curves", !!well);
  function select(id: string) {
    setSelected(id);
    localStorage.setItem("geocheck-well", id);
  }
  const restore = useMutation({
    mutationFn: () => post<Well[]>("/demo/restore"),
    onSuccess: async (ws) => {
      await cache.invalidateQueries();
      select(ws[0].id);
    },
  });
  const failure = [health, datasets, analyses, models, logs].find(
    (q) => q.isError,
  )?.error;
  const empty = (
    <div className="empty-state">
      <Layers3 size={38} />
      <h2>
        {datasets.isLoading
          ? "Загружаем рабочую область"
          : "Начните с данных скважины"}
      </h2>
      <p>
        Загрузите LAS или CSV либо откройте синтетический набор для знакомства с
        анализом.
      </p>
      <div className="actions">
        <Link className="primary" to="/data">
          <Plus size={16} />
          Загрузить файл
        </Link>
        <button disabled={restore.isPending} onClick={() => restore.mutate()}>
          <RefreshCw size={15} />
          {restore.isPending ? "Подготовка…" : "Восстановить демо"}
        </button>
      </div>
    </div>
  );
  return (
    <div className={"shell " + (open ? "navopen" : "")}>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          <span>
            GeoCheck <b>AI</b>
            <small>WELL DATA WORKSPACE</small>
          </span>
        </Link>
        <div className="project-box">
          <span className="project-avatar">G</span>
          <div>
            <strong>Геофизическая лаборатория</strong>
            <small>Локальный проект</small>
          </div>
        </div>
        <div className="nav-label">РАБОЧАЯ ОБЛАСТЬ</div>
        <nav>
          {navigation.map((n) => (
            <NavLink
              end
              key={n.path}
              to={n.path}
              onClick={() => setOpen(false)}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.path === "/models" && trained.length > 0 && (
                <small>{trained.length}</small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="side-wells">
          <div className="nav-label">
            СКВАЖИНЫ <span>{wells.length}</span>
          </div>
          <div className="side-search">
            <Search size={13} />
            <input
              aria-label="Поиск скважины"
              placeholder="Найти скважину"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {wells
            .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
            .map((w) => (
              <Link
                onClick={() => {
                  select(w.id);
                  setOpen(false);
                }}
                to="/viewer"
                key={w.id}
                className={"side-well " + (well?.id === w.id ? "chosen" : "")}
              >
                <span
                  className={
                    "well-dot " + (w.source === "synthetic" ? "synthetic" : "")
                  }
                />
                <span>
                  {w.name}
                  <small>
                    {Object.keys(w.units).length} каналов ·{" "}
                    {w.depth_unit || "ед. ?"}{" "}
                  </small>
                </span>
                <ChevronRight size={13} />
              </Link>
            ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className="demo-button"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
          >
            <RefreshCw size={15} />
            {restore.isPending ? "Подготовка данных…" : "Восстановить демо"}
          </button>
          <div className="local-status">
            <HardDrive size={15} />
            <span>
              Хранение на компьютере<small>GeoCheck AI · 2.0</small>
            </span>
            <i className={health.data ? "dot" : "offline"} />
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="nav-shade"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="mobilebtn iconbtn"
            aria-label="Навигация"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <FolderOpen size={16} />
          <span>Лаборатория</span>
          <ChevronRight size={13} />
          <b>{page.name}</b>
          <div className="top-status">
            <i className={health.data ? "dot" : "offline"} />
            {health.data
              ? "Сервер подключён"
              : health.error
                ? "Сервер недоступен"
                : "Подключение…"}
          </div>
          <span className="user-avatar">GC</span>
        </header>
        <main>
          <div className="pagehead">
            <div>
              <h1>{page.name}</h1>
              <p>{page.subtitle}</p>
            </div>
            {location.pathname !== "/data" && (
              <Link to="/data" className="primary">
                <Plus size={17} />
                Загрузить данные
              </Link>
            )}
          </div>
          {failure && (
            <div role="alert">
              {failure.message}
              <button onClick={() => cache.invalidateQueries()}>
                Повторить
              </button>
            </div>
          )}
          {restore.error && <div role="alert">{restore.error.message}</div>}
          {restore.isSuccess && (
            <div className="notice" role="status">
              <Layers3 size={16} />
              Демонстрационный набор доступен: две скважины для обучения и одна
              для проверки.
              <button
                className="iconbtn"
                aria-label="Скрыть уведомление"
                onClick={() => restore.reset()}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <Overview
                  wells={wells}
                  runs={runs}
                  models={trained}
                  select={select}
                  empty={empty}
                />
              }
            />
            <Route
              path="/data"
              element={
                <Workspace
                  wells={wells}
                  well={well}
                  data={logs.data}
                  select={select}
                />
              }
            />
            <Route
              path="/viewer"
              element={
                well && logs.data ? (
                  <Workbench
                    key={well.id + (requestedRunId ?? "")}
                    well={well}
                    data={logs.data}
                    runs={runs.filter((r) => r.dataset_id === well.id)}
                    models={trained}
                  />
                ) : (
                  empty
                )
              }
            />
            <Route
              path="/quality"
              element={<Navigate to="/viewer" replace />}
            />
            <Route
              path="/models"
              element={
                datasets.isPending || models.isPending ? (
                  <div className="empty">Загрузка скважин и моделей…</div>
                ) : (
                  <Models wells={wells} models={trained} />
                )
              }
            />
            <Route
              path="/reports"
              element={<Reports runs={runs} wells={wells} />}
            />
            <Route path="/sources" element={<Sources />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer>
            <span>Независимый исследовательский прототип</span>
            <span>Исходные измерения сохраняются в локальной базе</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
