import { useEffect, useEffectEvent, type ReactNode } from 'react';

const AUTO_CLOSE_MS = 6000;

/** A bottom toast: a message plus its action buttons. Announced politely; closes itself via `onClose`. */
export function Toast({
  children,
  actions,
  onClose,
}: {
  children: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
}) {
  const close = useEffectEvent(() => onClose?.());
  const closable = onClose !== undefined;
  useEffect(() => {
    if (!closable) return;
    const timer = setTimeout(close, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closable]);
  return (
    <div role="status" className="toast enter-rise">
      <span className="min-w-0">{children}</span>
      <span className="flex shrink-0 gap-2">{actions}</span>
    </div>
  );
}
