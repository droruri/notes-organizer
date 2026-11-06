import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/Sheet';
import { formatDate } from './formatDate';
import { snoozePresets, tomorrowOf } from './snooze';

/** The "Not now" sheet: three presets, a date picker, and "Wake now" when already snoozed. */
export function SnoozeSheet({
  today,
  snoozedUntil,
  onPick,
  onClose,
}: {
  today: string;
  snoozedUntil: string | null;
  /** `null` wakes the note. */
  onPick: (day: string | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const presets = snoozePresets(today);
  const [custom, setCustom] = useState('');
  const options = [
    ['tomorrow', presets.tomorrow],
    ['weekend', presets.weekend],
    ['nextWeek', presets.nextWeek],
  ] as const;
  return (
    <Sheet title={t('snooze.title')} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {options.map(([key, day]) => (
          <button
            key={key}
            type="button"
            className="btn justify-between"
            onClick={() => onPick(day)}
          >
            <span>{t(`snooze.${key}`)}</span>
            <span className="text-muted">{formatDate(day, i18n.language)}</span>
          </button>
        ))}
        <label className="label">
          {t('snooze.pick')}
          <input
            type="date"
            min={tomorrowOf(today)}
            value={custom}
            onChange={(e) => {
              const day = e.target.value;
              setCustom(day);
              if (day > today) onPick(day);
            }}
            className="field text-fg"
          />
        </label>
        {snoozedUntil !== null && (
          <button type="button" className="btn btn-ghost" onClick={() => onPick(null)}>
            {t('snooze.wake')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
