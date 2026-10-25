import { useTranslation } from 'react-i18next';

/** One "link not read" chip per link Claude could not read. */
export function UnreadLinkChips({ links }: { links: string[] }) {
  const { t } = useTranslation();
  return links.map((url) => (
    <a
      key={url}
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="rounded-full border border-danger px-2 text-sm text-danger"
    >
      {t('links.unread')}
    </a>
  ));
}
