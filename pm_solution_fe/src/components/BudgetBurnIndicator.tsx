import './BudgetBurnIndicator.css';

export type BudgetBurnIndicatorProps = {
  budget?: number | null;
  reportedCost?: number | null;
  currencyFormatter: Intl.NumberFormat;
  className?: string;
  label?: string | null;
};

export default function BudgetBurnIndicator({
  budget,
  reportedCost,
  currencyFormatter,
  className,
  label = undefined,
}: BudgetBurnIndicatorProps) {
  const budgetValue = budget ?? 0;
  const reportedValue = reportedCost ?? 0;

  const hasBudget = budgetValue > 0;
  const burnRatio = hasBudget ? reportedValue / budgetValue : 0;
  const clampedRatio = Math.min(Math.max(burnRatio, 0), 1);
  const burnPercentage = hasBudget ? Math.round(burnRatio * 100) : null;

  const classes = ['budgetBurn'];
  if (className) {
    classes.push(className);
  }

  const labelText = label ?? 'Vykázané náklady';
  const showLabel = label !== null;

  return (
    <div className={classes.join(' ')}>
      <div className="budgetBurn__header">
        {showLabel ? <div className="budgetBurn__label">{labelText}</div> : null}
        <div className="budgetBurn__values">
          <span className="budgetBurn__amount">{currencyFormatter.format(reportedValue)}</span>
          <span className="budgetBurn__separator" aria-hidden="true">
            •
          </span>
          <span className="budgetBurn__percentage">
            {hasBudget ? `${Math.max(burnPercentage ?? 0, 0)} %` : 'Bez rozpočtu'}
          </span>
        </div>
      </div>
      <div
        className="budgetBurn__bar"
        role={hasBudget ? 'progressbar' : undefined}
        aria-valuemin={hasBudget ? 0 : undefined}
        aria-valuemax={hasBudget ? 100 : undefined}
        aria-valuenow={hasBudget ? Math.min(Math.max(burnPercentage ?? 0, 0), 100) : undefined}
        aria-label={labelText}
      >
        <div
          className="budgetBurn__fill"
          style={{ width: `${(hasBudget ? clampedRatio : 0) * 100}%` }}
        />
      </div>
    </div>
  );
}
