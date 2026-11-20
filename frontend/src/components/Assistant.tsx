import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageSquare, Download, Send } from "lucide-react";
import { api, post } from "../api";
import { Panel } from "./ui";

interface Status {
  installed: boolean;
  stage: string;
  message: string;
  downloaded: number;
  total: number;
  model: string;
}
interface Answer {
  answer: string;
  model: string;
  limited: boolean;
  evidence: {
    analysis_id: string;
    scope: string;
    shown_findings: { number: number; start: number; end: number }[];
  };
}

export function Assistant({ runId, index }: { runId: string; index?: number }) {
  const [question, setQuestion] = useState(
    "Объясни это предупреждение простыми словами. Что нужно проверить?",
  );
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ["/assistant/status"],
    queryFn: () => api<Status>("/assistant/status"),
    refetchInterval: (q) =>
      ["downloading", "starting"].includes(q.state.data?.stage ?? "")
        ? 2000
        : false,
  });
  const install = useMutation({
    mutationFn: () => post<Status>("/assistant/install"),
    onSuccess: (data) => cache.setQueryData(["/assistant/status"], data),
  });
  const ask = useMutation({
    mutationFn: () =>
      post<Answer>("/assistant/ask", {
        analysis_id: runId,
        finding_index: index ?? null,
        question,
      }),
    onSettled: () =>
      cache.invalidateQueries({ queryKey: ["/assistant/status"] }),
  });
  const s = status.data;
  return (
    <Panel title="ИИ-помощник по анализу" action={<MessageSquare size={17} />}>
      <div className="formbody assistant-panel">
        <p className="hint">
          Локальный Qwen ·{" "}
          {index === undefined ? "сводка анализа" : `замечание № ${index + 1}`}.
          Объясняет результаты и предлагает проверки. Ответ требует оценки
          специалиста.
        </p>
        {s && !s.installed && (
          <div className="notice">
            <p>
              Для первого запуска скачайте модель: около 2,5 ГБ, нужен интернет.
              Затем ответы формируются на этом компьютере. Измерения не
              отправляются внешним сервисам.
            </p>
            <button
              disabled={install.isPending || s.stage === "downloading"}
              onClick={() => install.mutate()}
            >
              <Download size={15} /> Скачать локальную модель
            </button>
          </div>
        )}
        {s?.message && (
          <p role="status">
            {s.message}
            {s.stage === "downloading" && s.total > 0
              ? ` · ${Math.round((100 * s.downloaded) / s.total)}%`
              : ""}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask.mutate();
          }}
        >
          <label htmlFor="assistant-question">
            Вопрос по выбранному анализу
          </label>
          <textarea
            id="assistant-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            disabled={ask.isPending}
          />
          <button
            className="primary"
            disabled={
              !s?.installed || ask.isPending || question.trim().length < 3
            }
          >
            <Send size={15} />
            {ask.isPending ? "Модель готовит ответ…" : "Спросить помощника"}
          </button>
        </form>
        {ask.isPending && (
          <p role="status">
            Первый ответ включает загрузку модели в память. На CPU это может
            занять несколько минут.
          </p>
        )}
        {(status.error || install.error || ask.error) && (
          <p role="alert">
            {(status.error || install.error || ask.error)?.message}
          </p>
        )}
        {ask.data && (
          <div className="assistant-answer" aria-live="polite">
            <h3>Ответ · {ask.data.model}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{ask.data.answer}</p>
            {ask.data.limited && (
              <p className="hint">
                Ответ достиг ограничения длины. Уточните вопрос.
              </p>
            )}
            <details>
              <summary>Данные, переданные модели</summary>
              <p>{ask.data.evidence.scope}</p>
              <p>
                Замечания:{" "}
                {ask.data.evidence.shown_findings
                  .map((f) => `№ ${f.number}: ${f.start}–${f.end}`)
                  .join("; ") || "нет"}
              </p>
              <Link to={"/reports?run=" + ask.data.evidence.analysis_id}>
                Открыть исходный отчёт →
              </Link>
            </details>
            <p className="hint">
              Ответ модели не является подтверждённым заключением и не меняет
              данные или экспертные отметки.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
