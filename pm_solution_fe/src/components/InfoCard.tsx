import './InfoCard.css';

type InfoCardProps = {
  title: string;
  value: string;
};

export default function InfoCard({ title, value }: InfoCardProps) {
  return (
    <article className="infoCard" aria-label={title}>
      <h3 className="infoCard__title">{title}</h3>
      <p className="infoCard__value">{value}</p>
    </article>
  );
}

