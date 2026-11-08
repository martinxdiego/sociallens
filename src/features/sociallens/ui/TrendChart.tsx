import { number, shortDate } from './format';

type Point = {
  id: string;
  importedAt: string;
  followers: string[];
  following: string[];
  status: string;
};

export function TrendChart({ snapshots }: { snapshots: Point[] }) {
  const points = snapshots.filter(snapshot => snapshot.status === 'complete');
  if (!points.length)
    return (
      <p className="sl-hint">
        Sobald ein vollständiger Datenstand vorliegt, beginnt hier dein Verlauf.
      </p>
    );
  const maximum = Math.max(
    1,
    ...points.flatMap(point => [point.followers.length, point.following.length])
  );
  const start = Date.parse(points[0]!.importedAt);
  const duration = Math.max(1, Date.parse(points[points.length - 1]!.importedAt) - start);
  const x = (index: number) =>
    45 + ((Date.parse(points[index]!.importedAt) - start) / duration) * 690;
  const y = (value: number) => 190 - (value / maximum) * 150;
  return (
    <div className="sl-chart">
      <div className="sl-chart-legend">
        <span>
          <i /> Follower
        </span>
        <span>
          <i className="sl-chart-secondary" /> Gefolgt
        </span>
      </div>
      <svg
        viewBox="0 0 780 235"
        role="img"
        aria-label={`Entwicklung über ${points.length} vollständige Datenstände. Exakte Werte stehen in der aufklappbaren Datentabelle.`}
      >
        {[0, 0.5, 1].map(fraction => (
          <g key={fraction}>
            <line
              x1="45"
              x2="735"
              y1={y(maximum * fraction)}
              y2={y(maximum * fraction)}
              className="sl-chart-grid"
            />
            <text x="0" y={y(maximum * fraction) + 4}>
              {number(Math.round(maximum * fraction))}
            </text>
          </g>
        ))}
        <polyline
          points={points
            .map((point, index) => `${x(index)},${y(point.following.length)}`)
            .join(' ')}
          fill="none"
          className="sl-following-line"
        />
        <polyline
          points={points
            .map((point, index) => `${x(index)},${y(point.followers.length)}`)
            .join(' ')}
          fill="none"
          className="sl-followers-line"
        />
        {points.map((point, index) => (
          <g key={point.id}>
            <circle cx={x(index)} cy={y(point.followers.length)} r="4" className="sl-followers-dot">
              <title>
                {shortDate(point.importedAt)} · {number(point.followers.length)} Follower
              </title>
            </circle>
            <circle
              cx={x(index)}
              cy={y(point.following.length)}
              r="3"
              className="sl-following-dot"
            />
          </g>
        ))}
        <text x="45" y="222">
          {shortDate(points[0]!.importedAt)}
        </text>
        <text x="735" y="222" textAnchor="end">
          {points.length > 1
            ? shortDate(points[points.length - 1]!.importedAt)
            : 'Erster Datenstand'}
        </text>
      </svg>
      <p className="sl-hint">
        Punkte zeigen Importzeitpunkte. Linien verbinden Beobachtungen und enthalten keine Messwerte
        dazwischen.
      </p>
      <details>
        <summary>Werte als Tabelle</summary>
        <div className="sl-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Importiert am</th>
                <th>Follower</th>
                <th>Gefolgt</th>
              </tr>
            </thead>
            <tbody>
              {points.map(point => (
                <tr key={point.id}>
                  <td>{new Date(point.importedAt).toLocaleString('de-CH')}</td>
                  <td>{number(point.followers.length)}</td>
                  <td>{number(point.following.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
