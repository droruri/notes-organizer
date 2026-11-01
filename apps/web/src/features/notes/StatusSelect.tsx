import { NoteStatus, TRACKED_STATUSES, statusClass } from '@notes/shared';
import { useTranslation } from 'react-i18next';

/** A native select styled as the status pill; picks any tracked status (and none, if allowed). */
export function StatusSelect({
  status,
  onChange,
  allowNone = false,
  disabled = false,
}: {
  status: NoteStatus | null;
  onChange: (status: NoteStatus | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      aria-label={t('notes.status.label')}
      value={status ?? ''}
      disabled={disabled}
      onChange={(e) => {
        const parsed = NoteStatus.nullable().safeParse(
          e.target.value === '' ? null : e.target.value,
        );
        if (parsed.success) onChange(parsed.data);
      }}
      className={`pill pill-dot ${statusClass(status)} cursor-pointer`}
    >
      {TRACKED_STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(`notes.status.${s}`)}
        </option>
      ))}
      {allowNone && <option value="">{t('notes.status.none')}</option>}
    </select>
  );
}
