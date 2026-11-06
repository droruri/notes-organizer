import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  ChoiceDisplay,
  DEFAULT_NOTE_FORM,
  DEFAULT_QUICK_ACTIONS,
  HideableField,
  HideableStatus,
  Importance,
  QuickAction,
  Urgency,
  type NoteForm,
} from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { RemindersSettings } from '../reminders/RemindersSettings';
import { Chip } from './Chip';

/** Rows in the order the form shows them; body is required, so it has no switch. */
const ROWS: ReadonlyArray<HideableField | 'body'> = [
  'title',
  'body',
  'categories',
  'dueDate',
  'importance',
  'urgency',
];

/** App settings bottom sheet: the optional fields of the note form, and the mobile quick actions. */
export function NoteFormSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  // Null until the user changes a switch; until the stored choice loads, nothing is hidden and Save stays off.
  const [edited, setEdited] = useState<ReadonlyArray<HideableField> | null>(null);
  const stored = settings.data?.noteForm ?? DEFAULT_NOTE_FORM;
  const hidden = edited ?? stored.hiddenFields;
  const [displays, setDisplays] = useState<
    Partial<Record<'importance' | 'urgency', ChoiceDisplay>>
  >({});
  const displayOf = (f: 'importance' | 'urgency') => displays[f] ?? stored[f].display;
  const [hiddenValues, setHiddenValues] = useState<
    Partial<Record<'importance' | 'urgency', readonly string[]>>
  >({});
  const hiddenOf = (f: 'importance' | 'urgency'): readonly string[] =>
    hiddenValues[f] ?? stored[f].hiddenValues;
  const [quickEdited, setQuickEdited] = useState<ReadonlyArray<QuickAction> | null>(null);
  const quick = quickEdited ?? settings.data?.quickActions ?? DEFAULT_QUICK_ACTIONS;
  const [statusHiddenEdited, setStatusHiddenEdited] =
    useState<ReadonlyArray<HideableStatus> | null>(null);
  const statusHidden = statusHiddenEdited ?? stored.status.hiddenValues;
  const save = useMutation({
    mutationFn: () =>
      api.saveSettings({
        noteForm: {
          hiddenFields: [...hidden],
          importance: {
            display: displayOf('importance'),
            hiddenValues: Importance.options.filter((v) => hiddenOf('importance').includes(v)),
          },
          urgency: {
            display: displayOf('urgency'),
            hiddenValues: Urgency.options.filter((v) => hiddenOf('urgency').includes(v)),
          },
          status: {
            hiddenValues: HideableStatus.options.filter((v) => statusHidden.includes(v)),
          },
        } satisfies NoteForm,
        quickActions: QuickAction.options.filter((a) => quick.includes(a)),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
    },
  });
  const dirty =
    edited !== null ||
    quickEdited !== null ||
    statusHiddenEdited !== null ||
    Object.keys(displays).length > 0 ||
    Object.keys(hiddenValues).length > 0;

  const toggle = (f: HideableField, shown: boolean) =>
    setEdited(shown ? hidden.filter((x) => x !== f) : [...hidden, f]);

  return (
    <Sheet title={t('notes.formSettings.title')} onClose={onClose} dirty={dirty}>
      {(close) => (
        <>
          <ul className="group-list m-4">
            {ROWS.map((row) => {
              const name = t(`notes.formSettings.fields.${row}`);
              if (row === 'body') {
                return (
                  <li key={row} className="flex items-center gap-3 px-4 py-3 text-muted">
                    <span>{name}</span>
                    <span className="ms-auto text-sm">{t('notes.formSettings.always')}</span>
                  </li>
                );
              }
              const shown = !hidden.includes(row);
              return (
                <li
                  key={row}
                  className={`flex flex-wrap items-center gap-x-3 px-4 py-3 ${shown ? '' : 'text-muted'}`}
                >
                  <label className="flex w-full items-center gap-3">
                    <span>{name}</span>
                    {!shown && (
                      <span className="ms-auto text-sm">{t('notes.formSettings.hidden')}</span>
                    )}
                    <input
                      type="checkbox"
                      role="switch"
                      checked={shown}
                      aria-label={t('notes.formSettings.show', { field: name })}
                      onChange={(e) => toggle(row, e.target.checked)}
                      className={`h-5 w-9 accent-[var(--accent)] ${shown ? 'ms-auto' : ''}`}
                    />
                  </label>
                  {shown && (row === 'importance' || row === 'urgency') && (
                    <div className="mt-2 flex w-full items-center gap-3 text-sm text-muted">
                      <span>{t('notes.formSettings.displayAs')}</span>
                      <Segmented
                        label={t('notes.formSettings.displayAs')}
                        options={ChoiceDisplay.options}
                        value={displayOf(row)}
                        labelOf={(o) => (o ? t(`notes.formSettings.display.${o}`) : '')}
                        onChange={(next) => {
                          if (next) setDisplays({ ...displays, [row]: next });
                        }}
                      />
                    </div>
                  )}
                  {shown && (row === 'importance' || row === 'urgency') && (
                    <div className="mt-2 flex w-full flex-wrap items-center gap-2 text-sm text-muted">
                      <span>{t('notes.formSettings.values')}</span>
                      {(row === 'importance' ? Importance.options : Urgency.options).map((v) => {
                        const offered = !hiddenOf(row).includes(v);
                        const all: readonly string[] =
                          row === 'importance' ? Importance.options : Urgency.options;
                        const offeredCount = all.filter((x) => !hiddenOf(row).includes(x)).length;
                        return (
                          <Chip
                            key={v}
                            label={t(`notes.${row}Values.${v}`)}
                            selected={offered}
                            disabled={offered && offeredCount === 1}
                            onClick={() =>
                              setHiddenValues({
                                ...hiddenValues,
                                [row]: offered
                                  ? [...hiddenOf(row), v]
                                  : hiddenOf(row).filter((x) => x !== v),
                              })
                            }
                          />
                        );
                      })}
                      <p className="w-full">{t('notes.formSettings.lastValue')}</p>
                    </div>
                  )}
                </li>
              );
            })}
            <li className="bg-bg px-4 pt-3 pb-2 text-sm font-bold text-muted">
              {t('notes.formSettings.statusesTitle')}
            </li>
            {HideableStatus.options.map((s) => {
              const name = t(`notes.status.${s}`);
              const on = !statusHidden.includes(s);
              return (
                <li key={s} className={`flex items-center px-4 py-3 ${on ? '' : 'text-muted'}`}>
                  <label className="flex w-full items-center gap-3">
                    <span>{name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      aria-label={t('notes.formSettings.show', { field: name })}
                      onChange={(e) =>
                        setStatusHiddenEdited(
                          e.target.checked
                            ? statusHidden.filter((x) => x !== s)
                            : [...statusHidden, s],
                        )
                      }
                      className="ms-auto h-5 w-9 accent-[var(--accent)]"
                    />
                  </label>
                </li>
              );
            })}
            <li className="bg-bg px-4 pt-3 pb-2 text-sm font-bold text-muted">
              {t('notes.formSettings.quickActionsTitle')}
            </li>
            {QuickAction.options.map((a) => {
              const name = t(`notes.formSettings.quickAction.${a}`);
              const on = quick.includes(a);
              return (
                <li key={a} className={`flex items-center px-4 py-3 ${on ? '' : 'text-muted'}`}>
                  <label className="flex w-full items-center gap-3">
                    <span>{name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      aria-label={t('notes.formSettings.show', { field: name })}
                      onChange={(e) =>
                        setQuickEdited(
                          e.target.checked ? [...quick, a] : quick.filter((x) => x !== a),
                        )
                      }
                      className="ms-auto h-5 w-9 accent-[var(--accent)]"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          <RemindersSettings />
          {save.isError && (
            <p role="alert" className="notice notice-danger mx-5">
              {t('notes.formSettings.error')}
            </p>
          )}
          <div className="flex gap-2 border-t border-line px-5 py-3">
            <button
              type="button"
              onClick={() => save.mutate(undefined, { onSuccess: () => close(true) })}
              disabled={!settings.data || save.isPending}
              className="btn btn-primary"
            >
              {save.isPending ? t('notes.formSettings.saving') : t('notes.formSettings.save')}
            </button>
            <button type="button" onClick={() => close()} className="btn btn-ghost">
              {t('notes.formSettings.cancel')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
