import { createContext, useContext } from 'react';

/** True while snapshotting the full React Flow board to a PNG so off-screen & zoomed-out elements render in full detail. */
export const ExportingContext = createContext(false);

export function useIsExporting(): boolean {
  return useContext(ExportingContext);
}
