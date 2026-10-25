/** A centered spinner with its text; the text is what screen readers hear. */
export function Loading({ label }: { label: string }) {
  return (
    <p
      role="status"
      className="enter-fade flex items-center justify-center gap-2.5 py-16 text-muted"
    >
      <span aria-hidden="true" className="spinner" />
      {label}
    </p>
  );
}
