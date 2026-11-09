/** One-line form: an autofocused required input, a save button and a cancel button. */
export function InlineEditForm({
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled = false,
  saveLabel,
  cancelLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled?: boolean;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus
        className="field min-w-40 flex-1"
      />
      <button type="submit" disabled={disabled} className="btn btn-primary btn-sm">
        {saveLabel}
      </button>
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
        {cancelLabel}
      </button>
    </form>
  );
}
