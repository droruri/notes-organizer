import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';

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

/** Record and discard a voice note; stopping sends the recording to `onSend`. */
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
  const chunks = useRef<Blob[]>([]);

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
      if (r) r.onstop = null;
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
      chunks.current = [];
      next.ondataavailable = (e) => chunks.current.push(e.data);
      next.onstop = () => stream.getTracks().forEach((track) => track.stop());
      recorder.current = next;
      next.start();
      setSeconds(0);
      setPhase('recording');
    } catch (err) {
      setProblem(PROBLEM_BY_ERROR[errorName(err)] ?? 'failed');
    }
  };

  // The sending handler is installed here so it closes over this render's `onSend`.
  const stop = () => {
    const r = recorder.current;
    if (!r || r.state === 'inactive') return;
    r.onstop = () => {
      r.stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks.current, {
        type: r.mimeType || chunks.current[0]?.type || 'audio/webm',
      });
      setAudio(blob);
      setPhase('recorded');
      onSend(blob);
    };
    r.stop();
  };

  const discard = () => {
    const r = recorder.current;
    if (r) {
      r.onstop = null;
      if (r.state !== 'inactive') r.stop();
      r.stream.getTracks().forEach((track) => track.stop());
    }
    recorder.current = null;
    setAudio(null);
    setSeconds(0);
    setPhase('idle');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {phase === 'idle' && (
        <button type="button" onClick={start} className="btn btn-ghost text-muted">
          <Icon name="mic" size={16} />
          {t('voice.record')}
        </button>
      )}
      {phase !== 'idle' && (
        <span className="flex items-center gap-2 px-1 font-medium">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${
              phase === 'recording' ? 'bg-danger motion-safe:animate-pulse' : 'bg-muted'
            }`}
          />
          <span
            role="timer"
            aria-label={t('voice.elapsed')}
            className="text-[1.0625rem] tabular-nums"
          >
            {clock(seconds)}
          </span>
        </span>
      )}
      {phase === 'recording' && (
        <button type="button" onClick={stop} className="btn">
          <Icon name="stop" size={16} />
          {t('voice.stop')}
        </button>
      )}
      {phase === 'recorded' && pending && (
        <span role="status" className="flex items-center gap-2 text-muted">
          <span aria-hidden="true" className="spinner" />
          {t('voice.sending')}
        </span>
      )}
      {phase === 'recorded' && failed && !pending && audio && (
        <button type="button" onClick={() => onSend(audio)} className="btn btn-primary">
          <Icon name="send" size={16} />
          {t('voice.send')}
        </button>
      )}
      {phase !== 'idle' && (
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className="btn btn-ghost btn-danger"
        >
          <Icon name="trash" size={16} />
          {t('voice.discard')}
        </button>
      )}
      {(problem || failed) && (
        <p role="alert" className="notice notice-danger w-full">
          {t(problem ? `voice.${problem}` : 'voice.uploadFailed')}
        </p>
      )}
    </div>
  );
}
