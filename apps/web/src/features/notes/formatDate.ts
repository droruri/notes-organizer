export const formatDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso),
  );
