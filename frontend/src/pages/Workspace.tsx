import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, ArrowUpRight, FileSpreadsheet } from "lucide-react";
import { api, Well, Logs, fmt } from "../api";
import { Panel, Source } from "../components/ui";

export function Workspace({
  wells,
  well,
  data,
  select,
}: {
  wells: Well[];
  well?: Well;
  data?: Logs;
  select: (id: string) => void;
}) {
  const cache = useQueryClient(),
    input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(""),
    [hidden, setHidden] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 10485760) throw Error("Максимальный размер — 10 МиБ.");
      const form = new FormData();
      form.append("file", file);
      if (sourceUrl) form.append("source_url", sourceUrl);
      return api<Well>("/datasets/upload", { method: "POST", body: form });
    },
    onSuccess: async (w) => {
      await cache.invalidateQueries({ queryKey: ["/datasets"] });
      select(w.id);
      setPage(0);
      setHidden([]);
    },
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api("/datasets/" + id, { method: "DELETE" }),
    onSuccess: () => cache.invalidateQueries(),
    onError: (e) => setError(e.message),
  });
  function load(file?: File) {
    setError("");
    if (file && !upload.isPending) upload.mutate(file);
  }
  const cols = Object.keys(well?.units ?? {}).filter(
      (k) => !hidden.includes(k),
    ),
    current = Math.min(
      page,
      Math.max(0, Math.ceil((data?.depth.length ?? 0) / 25) - 1),
    );
  return (
    <>
      <div
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          load(e.dataTransfer.files[0]);
        }}
      >
        <span className="tile green">
          <Upload />
        </span>
        <div>
          <h2>Загрузить каротажные данные</h2>
          <p>Перетащите файл LAS или CSV · до 10 МиБ</p>
        </div>
        <button
          className="primary"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? "Загрузка…" : "Выбрать файл"}
        </button>
        <input
          type="file"
          accept=".csv,.las"
          hidden
          ref={input}
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="catalog-filters">
        <label className="field">
          Найти скважину
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название или имя файла"
          />
        </label>
        <label className="field">
          Источник следующего загружаемого файла
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://… (необязательно)"
          />
          <small>Ссылка сохранится в паспорте данных и обученной модели.</small>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <Panel title="Каталог скважин">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Скважина / файл</th>
                <th>Источник</th>
                <th>Формат</th>
                <th>Строки</th>
                <th>Глубина</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {wells
                .filter((w) =>
                  (w.name + " " + w.filename)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((w) => (
                  <tr
                    key={w.id}
                    className={w.id === well?.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="textbtn"
                        onClick={() => {
                          select(w.id);
                          setHidden([]);
                          setPage(0);
                        }}
                      >
                        <FileSpreadsheet size={15} />
                        {w.name}
                      </button>
                      <small>{w.filename}</small>
                    </td>
                    <td>
                      <Source well={w} />
                      {w.source_url && (
                        <small>
                          <a
                            href={w.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Открыть источник ↗
                          </a>
                        </small>
                      )}
                    </td>
                    <td>{w.format}</td>
                    <td>{fmt(w.rows)}</td>
                    <td>
                      {fmt(w.start)}–{fmt(w.end)} {w.depth_unit || "ед. ?"}
                    </td>
                    <td>
                      <button
                        aria-label={"Удалить " + w.name}
                        className="iconbtn"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              "Удалить файл " +
                                w.filename +
                                " и его сохранённые анализы?",
                            )
                          )
                            remove.mutate(w.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {well && data && (
        <Panel
          title={"Предпросмотр · " + well.name}
          action={
            <Link to="/viewer">
              Каротаж <ArrowUpRight size={14} />
            </Link>
          }
        >
          <div className="selection-summary">
            <span>
              Пропущено значений <b>{fmt(well.missing)}</b>
            </span>
            <span>
              Единицы не указаны{" "}
              <b>
                {Object.values(well.units).filter((u) => !u).length} каналов
              </b>
            </span>
          </div>
          <div className="checks">
            {Object.keys(well.units).map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(k)}
                  onChange={() =>
                    setHidden(
                      hidden.includes(k)
                        ? hidden.filter((x) => x !== k)
                        : [...hidden, k],
                    )
                  }
                />
                {k}
              </label>
            ))}
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Глубина [{well.depth_unit || "?"}]</th>
                  {cols.map((k) => (
                    <th key={k}>
                      {k} [{well.units[k] || "?"}]
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.depth
                  .slice(current * 25, current * 25 + 25)
                  .map((d, i) => (
                    <tr key={d}>
                      <td>{fmt(d)}</td>
                      {cols.map((k) => (
                        <td key={k} className="mono">
                          {data.curves[k].values[current * 25 + i] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <button disabled={!current} onClick={() => setPage(current - 1)}>
              Назад
            </button>
            Страница {current + 1} / {Math.ceil(well.rows / 25)}
            <button
              disabled={(current + 1) * 25 >= well.rows}
              onClick={() => setPage(current + 1)}
            >
              Далее
            </button>
            <a
              href={"/api/datasets/" + well.id + "/original"}
              download={well.filename}
            >
              Скачать оригинал
            </a>
          </div>
        </Panel>
      )}
    </>
  );
}
