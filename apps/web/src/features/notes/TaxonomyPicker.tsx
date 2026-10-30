import type { NewTag, Taxonomy } from '@notes/shared';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from './Chip';

export type Picked = {
  categoryIds: string[];
  tagIds: string[];
  newCategories: string[];
  newTags: NewTag[];
  /** Names Claude offered as new categories; chips stay toggleable even when not selected. */
  offeredCategories?: string[];
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const NEW_CATEGORY = '';

export function TaxonomyPicker({
  taxonomy,
  value,
  onChange,
}: {
  taxonomy: Taxonomy;
  value: Picked;
  onChange: (next: Picked) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [target, setTarget] = useState(NEW_CATEGORY);
  const usable = taxonomy.categories.filter((c) => !c.deleted);

  const toggleCategory = (id: string) => {
    const removing = value.categoryIds.includes(id);
    const tagsOfCategory = usable.find((c) => c.id === id)?.tags.map((tag) => tag.id) ?? [];
    onChange({
      ...value,
      categoryIds: toggle(value.categoryIds, id),
      tagIds: removing ? value.tagIds.filter((x) => !tagsOfCategory.includes(x)) : value.tagIds,
    });
  };
  // Picking a tag links its category too.
  const toggleTag = (categoryId: string, id: string) => {
    const selecting = !value.tagIds.includes(id);
    onChange({
      ...value,
      tagIds: toggle(value.tagIds, id),
      categoryIds:
        selecting && !value.categoryIds.includes(categoryId)
          ? [...value.categoryIds, categoryId]
          : value.categoryIds,
    });
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (target === NEW_CATEGORY) {
      if (!value.newCategories.includes(trimmed))
        onChange({ ...value, newCategories: [...value.newCategories, trimmed] });
    } else {
      const isExisting = usable.some((c) => c.id === target);
      const tag: NewTag = isExisting
        ? { categoryId: target, name: trimmed }
        : { categoryName: target, name: trimmed };
      onChange({ ...value, newTags: [...value.newTags, tag] });
    }
    setName('');
  };
  const toggleNewCategory = (n: string) =>
    value.newCategories.includes(n)
      ? onChange({
          ...value,
          newCategories: value.newCategories.filter((x) => x !== n),
          newTags: value.newTags.filter(
            (tag) => !('categoryName' in tag && tag.categoryName === n),
          ),
        })
      : onChange({ ...value, newCategories: [...value.newCategories, n] });
  const offered = [
    ...(value.offeredCategories ?? []),
    ...value.newCategories.filter((n) => !(value.offeredCategories ?? []).includes(n)),
  ];
  const removeNewTag = (tag: NewTag) =>
    onChange({ ...value, newTags: value.newTags.filter((x) => x !== tag) });

  const newTagChips = (match: (tag: NewTag) => boolean): ReactNode[] =>
    value.newTags.flatMap((tag, i) =>
      match(tag)
        ? [
            <Chip
              key={`new-${tag.name}-${i}`}
              tag
              label={tag.name}
              isNew
              selected
              onClick={() => removeNewTag(tag)}
            />,
          ]
        : [],
    );
  const placed = (tag: NewTag) =>
    'categoryId' in tag
      ? usable.some((c) => c.id === tag.categoryId)
      : offered.includes(tag.categoryName);
  const tagRows: { key: string; label: string; chips: ReactNode[] }[] = [
    ...usable.map((c) => ({
      key: c.id,
      label: c.name,
      chips: [
        ...c.tags
          .filter((tag) => !tag.deleted)
          .map((tag) => (
            <Chip
              key={tag.id}
              tag
              label={tag.name}
              selected={value.tagIds.includes(tag.id)}
              onClick={() => toggleTag(c.id, tag.id)}
            />
          )),
        ...newTagChips((tag) => 'categoryId' in tag && tag.categoryId === c.id),
      ],
    })),
    ...offered.map((n) => ({
      key: `offered-${n}`,
      label: n,
      chips: newTagChips((tag) => 'categoryName' in tag && tag.categoryName === n),
    })),
    { key: 'unplaced', label: '', chips: newTagChips((tag) => !placed(tag)) },
  ].filter((row) => row.chips.length > 0);

  return (
    <fieldset className="card flex flex-col gap-3 p-4">
      <legend className="sr-only">{t('notes.picker.categories')}</legend>
      <p aria-hidden="true" className="text-sm font-medium text-muted">
        {t('notes.picker.categories')}
      </p>
      <div className="flex flex-wrap gap-2">
        {usable.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={value.categoryIds.includes(c.id)}
            onClick={() => toggleCategory(c.id)}
          />
        ))}
        {offered.map((n) => (
          <Chip
            key={n}
            label={n}
            isNew
            selected={value.newCategories.includes(n)}
            onClick={() => toggleNewCategory(n)}
          />
        ))}
      </div>
      {tagRows.length > 0 && (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">{t('notes.picker.tags')}</legend>
            <p aria-hidden="true" className="text-sm font-medium text-muted">
              {t('notes.picker.tags')}
            </p>
            {tagRows.map((row) => (
              <fieldset key={row.key} className="flex flex-wrap items-center gap-2">
                {row.label !== '' && (
                  <legend className="mb-1 text-xs text-muted">{row.label}</legend>
                )}
                {row.chips}
              </fieldset>
            ))}
          </fieldset>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t('notes.picker.createLabel')}
          placeholder={t('notes.picker.createLabel')}
          className="field min-h-9 min-w-40 flex-1 py-1 text-sm"
        />
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={t('notes.picker.createIn')}
          className="field min-h-9 w-auto py-1 text-sm"
        >
          <option value={NEW_CATEGORY}>{t('notes.picker.newCategory')}</option>
          {usable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {value.newCategories.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} className="btn btn-sm">
          {t('notes.picker.add')}
        </button>
      </div>
    </fieldset>
  );
}
