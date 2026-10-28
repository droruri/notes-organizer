import { statusMoves, type NoteStatus } from '@notes/shared';
import { useTranslation } from 'react-i18next';

const step = 'btn btn-sm';

/** The current status with buttons for the legal one-step moves only. */
export function StatusStepper({
  status,
  onChange,
}: {
  status: NoteStatus;
  onChange: (status: NoteStatus) => void;
}) {
  const { t } = useTranslation();
  const { back, forward } = statusMoves(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`pill pill-dot status-${status}`}>{t(`notes.status.${status}`)}</span>
      {[back, forward].map(
        (to) =>
          to && (
            <button key={to} type="button" onClick={() => onChange(to)} className={step}>
              {t('notes.moveTo', { status: t(`notes.status.${to}`) })}
            </button>
          ),
      )}
    </div>
  );
}
