import { useQuery } from "@tanstack/react-query";

export interface Well {
  id: string;
  name: string;
  filename: string;
  source: string;
  format: string;
  created: string;
  depth_unit: string;
  rows: number;
  start: number;
  end: number;
  units: Record<string, string>;
  missing: number;
  demo_role?: "train" | "test";
  has_labels?: boolean;
  source_url?: string;
}
export interface Logs {
  depth: number[];
  curves: Record<string, { unit: string; values: (number | null)[] }>;
}
export interface Finding {
  method: string;
  curve: string;
  start: number;
  end: number;
  samples: number;
  reason: string;
  score: number | null;
}
export interface Settings {
  curves: string[];
  methods: string[];
  threshold: number;
  trees: number;
  contamination: number;
}
export interface Run {
  id: string;
  dataset_id: string;
  created: string;
  settings: Settings;
  count: number;
  versions: Record<string, string>;
  notes: string[];
  model?: { id: string; name: string };
}
export interface Result {
  findings: Finding[];
  scores: (number | null)[];
}
export interface Review {
  finding_index: number;
  status: "pending" | "confirmed" | "dismissed";
  comment: string;
  updated: string;
}
export interface Model {
  id: string;
  name: string;
  created: string;
  algorithm: string;
  sklearn: string;
  curves: string[];
  units: Record<string, string>;
  trees: number;
  contamination: number;
  seed: number;
  train_rows: number;
  duration_seconds: number;
  data_scope: string;
  train: { id: string; name: string; rows: number; source: string }[];
  evaluation: {
    id: string;
    name: string;
    scored_rows: number;
    flagged_rows: number;
    metrics: {
      precision: number;
      recall: number;
      f1: number;
      tp: number;
      fp: number;
      fn: number;
      tn: number;
    } | null;
  }[];
}
export function post<T>(path: string, body?: unknown) {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export const methods: Record<string, string> = {
  missing: "Пропуски",
  physical: "Физические ограничения",
  outlier: "Статистические выбросы",
  jump: "Резкие изменения",
  isolation: "Isolation Forest",
};
export const fmt = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export const date = (v: string) =>
  new Date(v).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, init);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Error(
      typeof body.detail === "string"
        ? body.detail
        : "Ошибка запроса (" +
            r.status +
            "). Проверьте параметры и доступность API.",
    );
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
export function useApi<T>(path: string, enabled = true) {
  return useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    retry: 1,
  });
}
