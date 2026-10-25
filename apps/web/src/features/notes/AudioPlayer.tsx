import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

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
  if (audio.data) return <audio controls autoPlay src={audio.data} aria-label={t('voice.play')} />;
  if (audio.isError) {
    return (
      <p role="alert" className="text-danger">
        {t('voice.audioFailed')}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setWanted(true)}
      disabled={wanted}
      className="w-fit rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover disabled:opacity-50"
    >
      {wanted ? t('voice.loading') : t('voice.play')}
    </button>
  );
}
