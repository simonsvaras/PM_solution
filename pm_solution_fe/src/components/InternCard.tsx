import './InternCard.css';
import type { InternOverview } from '../api';

type InternCardProps = {
  intern: InternOverview;
  onOpenDetail: (intern: InternOverview) => void;
};

function formatHours(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  return `${safe.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

export default function InternCard({ intern, onOpenDetail }: InternCardProps) {
  const groups = intern.groups.map(group => group.label).join(', ') || 'Bez skupiny';
  return (
    <button type="button" className="internCard" onClick={() => onOpenDetail(intern)}>
      <div className="internCard__header">
        <h3 className="internCard__name">
          {intern.firstName} {intern.lastName}
        </h3>
        <span className="internCard__username">@{intern.username}</span>
      </div>
      <dl className="internCard__meta">
        <div className="internCard__metaItem">
          <dt>Úroveň</dt>
          <dd>{intern.levelLabel}</dd>
        </div>
        <div className="internCard__metaItem">
          <dt>Skupiny</dt>
          <dd>{groups}</dd>
        </div>
        <div className="internCard__metaItem">
          <dt>Vykázané hodiny</dt>
          <dd className="internCard__hours">{formatHours(intern.totalHours)}</dd>
        </div>
      </dl>
      <p className="internCard__hint">Kliknutím zobrazíte detail stážisty.</p>
    </button>
  );
}
