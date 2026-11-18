import { BookOpen, ExternalLink, FileText, FolderInput } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui";
const sources = [
  {
    name: "КазМунайГаз · годовой отчёт 2025",
    type: "Публичный отчёт",
    url: "https://ar2025.kmg.kz/ru/strategic-report/operating-review/exploration",
    description:
      "Обзор геологоразведки, сведения о проектах и результатах бурения.",
    availability:
      "Файлы каротажа LAS/CSV на проверенной странице не обнаружены.",
  },
  {
    name: "КМГ · скважины Восточного Урихтау",
    type: "Материал о месторождении",
    url: "https://kmg.kz/ru/press-center/articles/skvazh-urikhtau/",
    description:
      "Описание скважинного фонда и производственной инфраструктуры.",
    availability:
      "Для обучения на измерениях потребуются кривые с глубиной и единицами.",
  },
  {
    name: "KMG Engineering · технический сборник",
    type: "Техническая публикация",
    url: "https://www.kmge.kz/wp-content/uploads/2022/04/Свод-сборника-с-разделами-22072021.pdf",
    description:
      "Поиском обнаружена публикация с оценками качества ГИС и описаниями каротажных методов.",
    availability:
      "Содержимое полного PDF и возможность извлечения обучающей таблицы ещё требуют проверки.",
  },
];
export function Sources() {
  return (
    <>
      <div className="source-intro">
        <span className="metric-icon blue">
          <BookOpen size={24} />
        </span>
        <div>
          <h2>Открытые материалы КазМунайГаза</h2>
          <p>
            Проверенные страницы и кандидаты для исследования · 18 ноября 2026
          </p>
        </div>
      </div>
      <div className="source-grid">
        {sources.map((s) => (
          <Panel key={s.url} title={s.type} action={<FileText size={17} />}>
            <div className="formbody">
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <div className="source-availability">{s.availability}</div>
              <a
                className="button"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                Открыть источник
                <ExternalLink size={14} />
              </a>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Подготовка данных для модели">
        <div className="formbody">
          <div className="data-requirements">
            <div>
              <b>Измерения по глубине</b>
              <p>
                LAS или CSV с колонкой DEPTH, DEPT или MD и числовыми
                каротажными каналами.
              </p>
            </div>
            <div>
              <b>Единицы и состав каналов</b>
              <p>
                Укажите единицы в заголовках CSV. Выбранные признаки должны
                совпадать между скважинами.
              </p>
            </div>
            <div>
              <b>Отдельная проверочная выборка</b>
              <p>
                Отведите другие скважины для оценки. Экспертная разметка
                позволит посчитать качество обнаружения.
              </p>
            </div>
          </div>
          <p className="hint">
            Текущая версия обучается на файлах из каталога. Ссылки выше
            открывают оригинальные публикации. Обучающий набор КМГ с каротажными
            измерениями пока не подключён.
          </p>
          <Link className="primary" to="/data">
            <FolderInput size={16} />
            Открыть каталог данных
          </Link>
        </div>
      </Panel>
    </>
  );
}
