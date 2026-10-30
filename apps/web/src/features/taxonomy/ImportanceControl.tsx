import type { Importance } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Segmented } from '../../ui/Segmented';

const LEVELS: readonly (Importance | null)[] = [null, 'important', 'not_important'];

/** Three-segment radio group for a category's default importance; one tap changes or clears it. */
export function ImportanceControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: Importance | null;
  disabled: boolean;
  onChange: (next: Importance | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <Segmented
      label={t('taxonomy.importance.labelFor', { name })}
      options={LEVELS}
      value={value}
      labelOf={(level) => t(`taxonomy.importance.${level ?? 'none'}`)}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
