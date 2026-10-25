import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Phase = 'idle' | 'recording' | 'recorded';
type Problem = 'denied' | 'noMic' | 'unsupported' | 'failed';

const PROBLEM_BY_ERROR: Record<string, Problem> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'noMic',
  OverconstrainedError: 'noMic',
};

const errorName = (err: unknown) =>
  typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Record, stop and discard a voice note; `onSend` gets the finished recording. */
export function VoiceRecorder({
  onSend,
  pending,
  failed,
}: {
  onSend: (audio: Blob) => void;
  pending: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [phase]);

  // Release the microphone if the component goes away mid-recording.
  useEffect(
    () => () => {
      const r = recorder.current;
      if (r && r.state !== 'inactive') r.stop();
      r?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const start = async () => {
    setProblem(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setProblem('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      next.ondataavailable = (e) => chunks.push(e.data);
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setAudio(new Blob(chunks, { type: next.mimeType || chunks[0]?.type || 'audio/webm' }));
        setPhase('recorded');
      };
      recorder.current = next;
      next.start();
      setSeconds(0);
      setPhase('recording');
    } catch (err) {
      setProblem(PROBLEM_BY_ERROR[errorName(err)] ?? 'failed');
    }
  };

  const stop = () => recorder.current?.stop();

  const discard = () => {
    const r = recorder.current;
    if (r && r.state !== 'inactive') {
      r.onstop = null;
      r.stop();
      r.stream.getTracks().forEach((track) => track.stop());
    }
    recorder.current = null;
    setAudio(null);
    setSeconds(0);
    setPhase('idle');
  };

  const button =
    'rounded-md border border-line px-4 py-2 hover:bg-surface-hover disabled:opacity-50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {phase === 'idle' && (
        <button type="button" onClick={start} className={button}>
          {t('voice.record')}
        </button>
      )}
      {phase !== 'idle' && (
        <span role="timer" aria-label={t('voice.elapsed')} className="tabular-nums">
          {clock(seconds)}
        </span>
      )}
      {phase === 'recording' && (
        <button type="button" onClick={stop} className={button}>
          {t('voice.stop')}
        </button>
      )}
      {phase === 'recorded' && audio && (
        <button
          type="button"
          onClick={() => onSend(audio)}
          disabled={pending}
          className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
        >
          {pending ? t('voice.sending') : t('voice.send')}
        </button>
      )}
      {phase !== 'idle' && (
        <button type="button" onClick={discard} disabled={pending} className={button}>
          {t('voice.discard')}
        </button>
      )}
      {(problem || failed) && (
        <p role="alert" className="w-full text-danger">
          {t(problem ? `voice.${problem}` : 'voice.uploadFailed')}
        </p>
      )}
    </div>
  );
}
