import { useEffect, useState } from 'react';
import { readOutboxAudio } from './outbox';

/** Plays a queued recording. */
export function AudioPreview({ clientId }: { clientId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    void readOutboxAudio(clientId).then((blob) => {
      if (!live || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [clientId]);
  return url ? <audio controls src={url} className="w-full" /> : null;
}
