const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant → the `datetime-local` input value in the device's timezone (`''` when unset/invalid). */
export function isoToLocalInput(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (device-local time) → ISO instant; null when empty or invalid. */
export function localInputToIso(value: string): string | null {
  if (value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
