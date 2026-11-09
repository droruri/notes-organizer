import { useTranslation } from 'react-i18next';

const field = 'field pointer-fine:min-h-9 w-auto py-1 text-sm';

/** A label with a from and a to date input. */
export function DateRangeField({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-sm font-medium text-muted sm:w-24">{label}</span>
      <input
        type="date"
        aria-label={`${label} — ${t('filters.from')}`}
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className={field}
      />
      <input
        type="date"
        aria-label={`${label} — ${t('filters.to')}`}
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className={field}
      />
    </div>
  );
}
