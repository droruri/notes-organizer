import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNoteAudio } from '../../api';
import { Icon } from '../../ui/Icon';

/** A note's recording: fetched (with the auth token) only once the user asks to play it. */
export function AudioPlayer({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const [wanted, setWanted] = useState(false);
  const audio = useNoteAudio(noteId, wanted);
  if (audio.data)
    return (
      <audio
        controls
        autoPlay
        src={audio.data}
        aria-label={t('voice.play')}
        className="h-10 w-full max-w-md"
      />
    );
  if (audio.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t('voice.audioFailed')}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setWanted(true)}
      disabled={wanted}
      className="btn btn-sm w-fit"
    >
      {wanted ? <span aria-hidden="true" className="spinner" /> : <Icon name="play" size={14} />}
      {wanted ? t('voice.loading') : t('voice.play')}
    </button>
  );
}
