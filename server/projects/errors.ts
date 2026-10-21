// Errors that map to HTTP statuses in server/routes/http.ts.
export class StaleError extends Error{constructor(public currentHash:string|null,public currentSource:string|null){super('The file changed since this edit started.');this.name='StaleError';}}
export class NotFoundError extends Error{constructor(message:string){super(message);this.name='NotFoundError';}}
// 410: the undo window has passed; the entry stays in the trash.
export class GoneError extends Error{constructor(message:string){super(message);this.name='GoneError';}}
// 409: the target location is taken; nothing was overwritten. `suggestion` names a free target.
export class OccupiedError extends Error{constructor(message:string,public suggestion:Record<string,string>){super(message);this.name='OccupiedError';}}
// 409: a commit of chosen files during a merge; only the merge itself can be committed.
export class MergingError extends Error{constructor(public conflicts:string[]){super('A merge is in progress: commit the merge (with every conflict resolved) before committing chosen files.');this.name='MergingError';}}
// 409: an import would replace existing files and no choice was given.
export class ConflictError extends Error{constructor(public conflicts:string[]){super('Files with these names already exist in the project. Choose replace or keep both.');this.name='ConflictError';}}
