import { NoteStatus, TRACKED_STATUSES } from '@notes/shared';
import { useTranslation } from 'react-i18next';

/** A native select as a form field; picks any tracked status. */
export function StatusSelect({
  status,
  onChange,
  hiddenValues,
  disabled = false,
}: {
  status: NoteStatus | null;
  onChange: (status: NoteStatus | null) => void;
  hiddenValues: readonly NoteStatus[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="label">
      {t('notes.status.label')}
      <select
        value={status ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const parsed = NoteStatus.nullable().safeParse(
            e.target.value === '' ? null : e.target.value,
          );
          if (parsed.success) onChange(parsed.data);
        }}
        className="field text-fg"
      >
        {TRACKED_STATUSES.filter((s) => !hiddenValues.includes(s) || s === status).map((s) => (
          <option key={s} value={s}>
            {t(`notes.status.${s}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
