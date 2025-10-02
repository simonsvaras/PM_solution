import './InfoCard.css';

type InfoCardProps = {
  title: string;
  value: string;
  description?: string;
};

export default function InfoCard({ title, value, description }: InfoCardProps) {
  return (
    <article className="infoCard" aria-label={title}>
      <h3 className="infoCard__title">{title}</h3>
      <p className="infoCard__value">{value}</p>
      {description ? <p className="infoCard__description">{description}</p> : null}
    </article>
  );
}

