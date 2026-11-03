import { type PointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { useEscape } from './useEscape';
import { useExit } from './useExit';

/** Past this share of its height a drag dismisses the sheet. */
const DISMISS_RATIO = 0.25;
/** A release faster than this (px/ms) dismisses regardless of distance. */
const FLICK_SPEED = 0.5;
/** Movement before the drag axis is decided (px). */
const AXIS_SLOP = 8;
/** A fast release only dismisses once it has moved at least this far (px). */
const FLICK_MIN_DISTANCE = 48;

const isBottomSheet = () => !window.matchMedia?.('(min-width: 640px)').matches;
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Drag = { x: number; y: number; t: number; axis: 'none' | 'y'; dy: number };

/**
 * The one sheet: a bottom sheet under 640px (grabber, swipe-down to dismiss), a centered
 * dialog above. Closes on Esc, backdrop click, the close button or a swipe. With `dirty`,
 * closing asks first. `children` may be a function receiving `close(force)`, where
 * `force` skips the confirmation (e.g. after a successful save).
 */
export function Sheet({
  title,
  onClose,
  children,
  dirty = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode | ((close: (force?: boolean) => void) => ReactNode);
  dirty?: boolean;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const { closing, exit, onTransitionEnd } = useExit();
  const panel = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Set<number>());

  const close = (force = false) => {
    if (!force && dirty && !window.confirm(t('sheet.discardConfirm'))) return;
    exit(onClose);
  };
  useEscape(() => close());

  // Move focus into the sheet so keyboard users don't stay on the trigger behind it.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const reset = () => {
    drag.current = null;
    const el = panel.current;
    if (el) {
      el.style.transition = '';
      el.style.translate = '';
    }
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.add(e.pointerId);
    // A second finger (anywhere on the sheet) cancels any drag in progress and blocks a new one.
    if (pointers.current.size > 1) return reset();
    // Only the handle starts a drag; the body scrolls normally.
    const onHandle = e.target instanceof Node && !!handle.current?.contains(e.target);
    if (!onHandle || !isBottomSheet()) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: 'none', dy: 0 };
    panel.current?.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el || pointers.current.size !== 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === 'none') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP) return;
      // Horizontal (or upward) drags never move the sheet.
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) return reset();
      d.axis = 'y';
      el.style.transition = 'none';
    }
    d.dy = Math.max(0, dy);
    el.style.translate = `0 ${d.dy}px`;
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    const el = panel.current;
    if (!d || !el || d.axis !== 'y') return reset();
    const height = el.offsetHeight;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    const dismiss =
      d.dy > height * DISMISS_RATIO || (speed > FLICK_SPEED && d.dy >= FLICK_MIN_DISTANCE);
    if (!dismiss) return reset();
    if (dirty && !window.confirm(t('sheet.discardConfirm'))) return reset();
    drag.current = null;
    el.style.transition = '';
    el.style.translate = reducedMotion() ? '' : '0 100%';
    exit(onClose);
  };

  const onCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    reset();
  };

  return (
    <div
      className={`backdrop enter-fade ${closing ? 'closing ' : ''}flex items-end justify-center sm:items-center sm:p-6`}
      onTransitionEnd={onTransitionEnd}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        className={`enter-sheet sheet ${closing ? 'closing ' : ''}flex max-h-[92dvh] w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} flex-col overflow-hidden bg-surface text-fg`}
      >
        <div data-testid="sheet-handle" ref={handle} className="sheet-handle">
          <div aria-hidden="true" className="sheet-grabber sm:hidden" />
          <div className="flex items-center gap-2 border-b border-line px-5 py-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={() => close()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('sheet.close')}
              className="btn btn-ghost btn-icon min-h-11 min-w-11 ms-auto"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {typeof children === 'function' ? children(close) : children}
        </div>
      </div>
    </div>
  );
}
