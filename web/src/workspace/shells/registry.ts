import type { WorkspaceMode } from '../../types';

/**
 * Reader shells sit on the shared snapshot. The kernel stays scene-agnostic;
 * each shell only decides how authored records are arranged for reading.
 * Add a future scene by registering another id here — do not specialize lib/.
 */
export const WORKSPACE_SHELLS = ['general', 'audit', 'ultra'] as const satisfies readonly WorkspaceMode[];

export function isWorkspaceShell(value: string | null | undefined): value is WorkspaceMode {
  return value === 'general' || value === 'audit' || value === 'ultra';
}
