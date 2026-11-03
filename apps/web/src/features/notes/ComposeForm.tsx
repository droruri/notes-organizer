import { MAX_TITLE_LENGTH } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { NavBar } from '../../ui/NavBar';
import { VoiceRecorder } from './VoiceRecorder';

const inputDir = (value: string) => (value.trim() ? 'auto' : 'rtl');

/** The add-note form. Mutations live in the parent; this renders the fields and reports intent. */
export function ComposeForm({
  title,
  text,
  onTitle,
  onText,
  online,
  suggesting,
  suggestFailed,
  voicePending,
  voiceFailed,
  saveFailed,
  autoRecord,
  onSuggest,
  onVoice,
  onCancel,
}: {
  title: string;
  text: string;
  onTitle: (value: string) => void;
  onText: (value: string) => void;
  online: boolean;
  suggesting: boolean;
  suggestFailed: boolean;
  voicePending: boolean;
  voiceFailed: boolean;
  /** Saving to the offline queue failed. */
  saveFailed: boolean;
  autoRecord: boolean;
  onSuggest: () => void;
  onVoice: (audio: Blob) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form
      className="enter-rise flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSuggest();
      }}
    >
      <NavBar
        title={t('notes.add')}
        onBack={onCancel}
        action={
          <button
            type="submit"
            disabled={suggesting || text.trim() === ''}
            className="btn btn-primary min-h-11"
          >
            {suggesting ? (
              <span aria-hidden="true" className="spinner" />
            ) : (
              <Icon name="spark" size={16} />
            )}
            {suggesting ? t('notes.suggesting') : t('notes.suggest')}
          </button>
        }
      />
      {!online && (
        <p role="status" className="notice notice-info">
          {t('offline.banner')}
        </p>
      )}
      <div className="card flex flex-col gap-3 p-3 transition-[box-shadow] duration-150 has-[:focus-visible]:shadow-[0_0_0_2px_var(--accent)]">
        <div className="border-b border-line pb-3">
          <VoiceRecorder
            onSend={onVoice}
            pending={voicePending}
            failed={voiceFailed}
            autoStart={autoRecord}
          />
        </div>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          dir={inputDir(title)}
          aria-label={t('notes.noteTitle')}
          placeholder={t('notes.noteTitle')}
          className="w-full bg-transparent px-1 py-1 text-[1.0625rem] font-semibold outline-none placeholder:font-normal placeholder:text-muted focus-visible:outline-none"
        />
        <textarea
          autoFocus
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={6}
          dir={inputDir(text)}
          aria-label={t('notes.body')}
          placeholder={t('notes.placeholder')}
          className="w-full resize-none bg-transparent px-1 py-1 text-[1.0625rem] leading-relaxed outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </div>
      {saveFailed && (
        <p role="alert" className="notice notice-danger">
          {t('offline.saveFailed')}
        </p>
      )}
      {suggestFailed && (
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 max-lg:hidden">
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t('notes.cancel')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('notes.suggestHint')}</p>
    </form>
  );
}
