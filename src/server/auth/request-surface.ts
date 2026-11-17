// Carries the definition surface established by the operation caller.
import type { Caller } from './caller';

/** Definition surface attached by the operation boundary. */
export const requestDefinitionSurface = Symbol('requestDefinitionSurface');
type SurfaceRequest = Request & { [requestDefinitionSurface]?: RequestSurface };
/** Whether a request comes through the browser authoring surface or a consumer surface. */
export type RequestSurface = 'browser' | 'agent';

/** Attaches authenticated caller metadata; protocol callers always consume published definitions. */
export function attachRequestSurface(request: Request, caller: Caller): void {
  (request as SurfaceRequest)[requestDefinitionSurface] = caller.origin === 'http' ? (caller.surface ?? 'agent') : 'agent';
}

/** Unclassified requests fail closed to the consumer surface. */
export function requestSurface(request: Request): RequestSurface {
  return (request as SurfaceRequest)[requestDefinitionSurface] ?? 'agent';
}
