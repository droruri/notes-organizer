const cached = (options: Intl.DateTimeFormatOptions) => {
  const cache = new Map<string, Intl.DateTimeFormat>();
  return (lang: string) => {
    let formatter = cache.get(lang);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(lang, options);
      cache.set(lang, formatter);
    }
    return formatter;
  };
};

export const dateFormatter = cached({ day: 'numeric', month: 'short', year: 'numeric' });
export const dateTimeFormatter = cached({
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string, lang: string) =>
  dateFormatter(lang).format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));

export const formatDateTime = (iso: string, lang: string) =>
  dateTimeFormatter(lang).format(new Date(iso));

/** The "updated" date, or null when unknown or on the same day as creation. */
export const updatedDate = (createdAt: string, updatedAt: string, lang: string) => {
  if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) return null;
  const updated = formatDate(updatedAt, lang);
  return updated === formatDate(createdAt, lang) ? null : updated;
};
