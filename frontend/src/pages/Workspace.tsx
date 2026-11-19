import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    setPage(0);
    setHidden([]);
  }, [well?.id]);
  const [search, setSearch] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [source, setSource] = useState("upload");
  const [batch, setBatch] = useState<
    { name: string; status: string; error?: string; id?: string }[]
  >([]);
  const busy = useRef(false);
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const items = files.map((file) => ({
        name: file.name,
        status: "Ожидает",
        error: undefined as string | undefined,
        id: undefined as string | undefined,
      }));
      const uploaded: Well[] = [];
      setBatch([...items]);
      for (const [index, file] of files.entries()) {
        items[index] = { ...items[index], status: "Загрузка…" };
        setBatch([...items]);
        try {
          if (file.size > 10485760)
            throw Error("Максимальный размер — 10 МиБ.");
          const form = new FormData();
          form.append("file", file);
          form.append("source", source);
          if (sourceUrl) form.append("source_url", sourceUrl);
          const well = await api<Well>("/datasets/upload", {
            method: "POST",
            body: form,
          });
          uploaded.push(well);
          items[index] = { ...items[index], status: "Сохранён", id: well.id };
        } catch (e) {
          items[index] = {
            ...items[index],
            status: "Ошибка",
            error: e instanceof Error ? e.message : "Не удалось загрузить файл",
          };
        }
        setBatch([...items]);
      }
      return uploaded;
    },
    onSuccess: async (uploaded) => {
      await cache.invalidateQueries({ queryKey: ["/datasets"] });
      if (uploaded.length) select(uploaded[uploaded.length - 1].id);
      setPage(0);
      setHidden([]);
    },
    onError: (e) => setError(e.message),
    onSettled: () => {
      busy.current = false;
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api("/datasets/" + id, { method: "DELETE" }),
    onSuccess: () => cache.invalidateQueries(),
    onError: (e) => setError(e.message),
  });
  function load(files: File[]) {
    setError("");
    if (busy.current || !files.length) return;
    if (files.length > 20) {
      setError("Выберите до 20 файлов за один раз.");
      return;
    }
    busy.current = true;
    upload.mutate(files);
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
          load(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="tile green">
          <Upload />
        </span>
        <div>
          <h2>Загрузить каротажные данные</h2>
          <p>До 20 файлов LAS или CSV за раз · до 10 МиБ каждый</p>
        </div>
        <button
          className="primary"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? "Загрузка…" : "Выбрать файлы"}
        </button>
        <input
          type="file"
          accept=".csv,.las"
          multiple
          hidden
          ref={input}
          onChange={(e) => {
            load(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <div className="catalog-filters">
        <label className="field">
          Тип загружаемых данных
          <select
            value={source}
            disabled={upload.isPending}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="upload">Файлы пользователя</option>
            <option value="synthetic">Синтетические / учебные данные</option>
          </select>
          <small>
            Тип и ссылка применяются ко всем файлам выбранной партии.
          </small>
        </label>
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
            disabled={upload.isPending}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://… (необязательно)"
          />
          <small>Ссылка сохранится в паспорте данных и обученной модели.</small>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!!batch.length && (
        <Panel title="Результат загрузки">
          <div className="formbody" aria-live="polite">
            <p>
              {upload.isPending
                ? "Обрабатываем файлы последовательно…"
                : "Загрузка завершена."}{" "}
              Сохранено {batch.filter((x) => x.id).length} из {batch.length}.
              Ошибки одного файла не отменяют остальные.
            </p>
            <ul className="batch-results">
              {batch.map((item, i) => (
                <li key={i}>
                  <strong>{item.name}</strong>
                  <span>{item.status}</span>
                  {item.error && <span role="alert">{item.error}</span>}
                  {item.id && (
                    <button
                      className="textbtn"
                      onClick={() => {
                        select(item.id!);
                        setPage(0);
                        setHidden([]);
                      }}
                    >
                      Открыть данные
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}
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
