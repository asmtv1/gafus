import type {
  VideoPlaybackQualityBreakdown, VideoPlaybackQualityReport,
} from "@gafus/types";
import "./VideoQualityPanel.css";

const label: Record<string,string> = {
  moments:"Моменты", chat:"Чат", web:"Web", ios:"iPhone", android:"Android",
  wifi:"Wi-Fi", ethernet:"Ethernet", cellular:"Мобильная сеть",
  unknown:"Неизвестно",
};
function readable(name: string) { return label[name] ?? name; }
const fmt = (value: number) => value.toLocaleString("ru-RU");
const percent = (count: number, total: number) =>
  total ? (100 * count / total).toLocaleString("ru-RU",{maximumFractionDigits:1}) + "%" : "0%";

function Breakdown({title,values}: {title:string;values:VideoPlaybackQualityBreakdown[]}) {
  return <section className="quality-breakdown content-card">
    <h3>{title}</h3>
    <div className="table-scroll">
      <table>
        <thead><tr><th>Группа</th><th>360p</th><th>720p</th><th>Доля 360p</th><th>Всего</th></tr></thead>
        <tbody>
          {values.map(row => <tr key={row.label}>
            <th scope="row">{readable(row.label)}</th>
            <td>{fmt(row.count360)}</td><td>{fmt(row.count720)}</td>
            <td>{percent(row.count360,row.total)}</td><td>{fmt(row.total)}</td>
          </tr>)}
          {!values.length && <tr><td colSpan={5}>Пока нет запусков</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
export function VideoQualityPanel({source}: {source:unknown}) {
  const data = source as VideoPlaybackQualityReport | null;
  if (!data || typeof data.total !== "number" || !Array.isArray(data.byDay) ||
      !Array.isArray(data.bySurface) || !Array.isArray(data.byPlatform) ||
      !Array.isArray(data.byNetwork)) {
    return <div className="content-card" role="alert">Некорректный ответ статистики качества видео.</div>;
  }
  const maxDaily = Math.max(1,...data.byDay.map(x=>x.total));
  return <div className="quality-report">
    <p className="note">Фактические начала воспроизведения MP4, а не предварительные решения алгоритма.
      Дни по UTC: {data.from} — {data.through}. Повторная отправка одного события не увеличивает счётчик.</p>
    <div className="quality-metrics">
      <div className="content-card"><small>Всего запусков</small><strong>{fmt(data.total)}</strong></div>
      <div className="content-card"><small>360p</small><strong>{fmt(data.count360)}</strong><span>{percent(data.count360,data.total)}</span></div>
      <div className="content-card"><small>720p</small><strong>{fmt(data.count720)}</strong><span>{percent(data.count720,data.total)}</span></div>
    </div>
    <section className="content-card quality-details">
      <h3>Почему выбирали 360p</h3>
      <div className="quality-metrics quality-metrics--small">
        <div><strong>{fmt(data.auto360)}</strong><small>Автоматически</small></div>
        <div><strong>{fmt(data.manual360)}</strong><small>Вручную</small></div>
        <div><strong>{fmt(data.only360)}</strong><small>720p отсутствовало</small></div>
        <div><strong>{fmt(data.savingData360)}</strong><small>Экономия трафика</small></div>
        <div><strong>{fmt(data.fallbackStarts)}</strong><small>Запусков через S3 fallback (оба качества)</small></div>
      </div>
      <p className="note">«720p отсутствовало» означает, что оно не было доступно в момент запуска.
        Это не доказательство потребности в 360p. Ручной выбор, экономия трафика
        и слабая сеть важны при решении об удалении качества.</p>
    </section>
    <section className="content-card">
      <h3>Динамика запусков по дням</h3>
      {data.total === 0 && <p>Данных пока нет. Первые значения появятся после релиза API
        с миграцией базы и обновлённых клиентов.</p>}
      <div className="quality-daily" role="table" aria-label="Запуски 360p и 720p по дням">
        {data.byDay.map(day => <div key={day.label} className="quality-day" role="row">
          <time role="cell" dateTime={day.label}>{day.label.slice(5)}</time>
          <div className="quality-day__track" role="cell"
            aria-label={`${day.label}: 360p — ${day.count360}, 720p — ${day.count720}`}>
            <div className="quality-day__bar quality-day__bar--360"
              style={{width:`${day.count360/maxDaily*100}%`}} />
            <div className="quality-day__bar quality-day__bar--720"
              style={{width:`${day.count720/maxDaily*100}%`}} />
          </div>
          <span role="cell">{fmt(day.total)}</span>
        </div>)}
      </div>
      <div className="quality-legend"><span className="quality-swatch quality-swatch--360"/> 360p
        <span className="quality-swatch quality-swatch--720"/> 720p</div>
    </section>
    <div className="quality-slices">
      <Breakdown title="По разделам" values={data.bySurface} />
      <Breakdown title="По платформам" values={data.byPlatform} />
      <Breakdown title="По типу сети" values={data.byNetwork} />
    </div>
    <p className="note">В отчёт попадают только подтверждённые клиентом запуски. При отсутствии
      интернета или блокировке аналитики отдельные просмотры могут не учитываться.
      ID пользователей, видеозаписей и названия Wi-Fi не собираются.</p>
  </div>;
}
