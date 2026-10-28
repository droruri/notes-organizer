import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';

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
      className="pill bg-danger-soft text-danger underline-offset-2 hover:underline"
    >
      <Icon name="link" size={13} />
      {t('links.unread')}
    </a>
  ));
}
