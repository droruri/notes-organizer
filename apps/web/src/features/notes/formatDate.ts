export const formatDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso),
  );

/** The "updated" date, or null when unknown or on the same day as creation. */
export const updatedDate = (createdAt: string, updatedAt: string, lang: string) => {
  if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) return null;
  const updated = formatDate(updatedAt, lang);
  return updated === formatDate(createdAt, lang) ? null : updated;
};
