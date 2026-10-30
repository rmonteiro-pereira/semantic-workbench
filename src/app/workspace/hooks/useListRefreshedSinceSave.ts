import { useState } from 'react';
import type { ProjectInfo } from '../../projects/api';
import type { AutosaveStatus } from '../../projects/autosave';

/**
 * Tells whether the project list has been replaced since autosave last reported `saved`. The list
 * carries each project's uncommitted-file count, so until it refreshes it still describes the file
 * as it was before the save. The comparison runs while rendering, so there is no frame in which the
 * status is `saved` and the list is wrongly taken as fresh.
 */
export function useListRefreshedSinceSave(saveStatus: AutosaveStatus, projects: ProjectInfo[]) {
  const [seen, setSeen] = useState<{ status: AutosaveStatus; listAtSave: ProjectInfo[] | null }>({ status: saveStatus, listAtSave: null });
  if (seen.status !== saveStatus) {
    setSeen({ status: saveStatus, listAtSave: saveStatus === 'saved' ? projects : null });
  }
  const waitingForList = saveStatus === 'saved' && seen.status === saveStatus && seen.listAtSave === projects;
  return !waitingForList;
}
