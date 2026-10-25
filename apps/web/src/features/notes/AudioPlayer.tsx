import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';

/** A note's recording: fetched (with the auth token) only once the user asks to play it. */
export function AudioPlayer({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const [wanted, setWanted] = useState(false);
  const audio = useQuery({
    queryKey: ['audio', noteId],
    // The object URL lives as long as the cached query, so the player can be reopened.
    queryFn: async () => URL.createObjectURL(await api.noteAudio(noteId)),
    enabled: wanted,
    staleTime: Infinity,
  });
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
