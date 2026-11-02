import { z } from 'zod';
import { SavedFilter } from './noteQuery';

export const Workspace = z.object({
  id: z.uuid(),
  name: z.string(),
  isDefault: z.boolean(),
  /** Saved default note filter (no search text); null = none. */
  defaultFilter: SavedFilter.nullable(),
});
export type Workspace = z.infer<typeof Workspace>;

export const WorkspaceList = z.array(Workspace);
export type WorkspaceList = z.infer<typeof WorkspaceList>;

/** Body of `POST /workspaces`. */
export const WorkspaceCreate = z.object({ name: z.string() });
export type WorkspaceCreate = z.infer<typeof WorkspaceCreate>;

/** Body of `PATCH /workspaces/:id`: a new name, `isDefault: true` (the default moves, never clears) and/or a `defaultFilter`. */
export const WorkspaceEdit = z
  .object({
    name: z.string().optional(),
    isDefault: z.literal(true).optional(),
    /** `null` clears the saved filter. */
    defaultFilter: SavedFilter.nullable().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.isDefault !== undefined || v.defaultFilter !== undefined,
  );
export type WorkspaceEdit = z.infer<typeof WorkspaceEdit>;

/** Why a workspace change was refused. */
export const WorkspaceFailure = z.enum(['invalid_name', 'name_taken', 'not_found', 'is_default']);
export type WorkspaceFailure = z.infer<typeof WorkspaceFailure>;

/** The workspace with this id if the list has it, else the default; undefined for an empty list. */
export function resolveWorkspace(
  workspaces: readonly Workspace[],
  id?: string | null,
): Workspace | undefined {
  return workspaces.find((w) => w.id === id) ?? workspaces.find((w) => w.isDefault);
}
