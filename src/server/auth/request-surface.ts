// Carries the browser-versus-agent choice made from credentials at the existing access boundary.
/** Definition surface attached by the existing credential boundary. */
export const requestDefinitionSurface = Symbol('requestDefinitionSurface');
type SurfaceRequest = Request & { [requestDefinitionSurface]?: RequestSurface };
/** Whether a request comes through the browser authoring surface or a consumer surface. */
export type RequestSurface = 'browser' | 'agent';
/** Existing middleware signals used until the operation boundary supplies an explicit surface. */
export type SurfaceCredential = {
  mode: 'local' | 'server';
  session: boolean;
  originAllowed: boolean;
};

/** Classifies a validated credential and trusted local browser markers in one replaceable seam. */
export function surfaceFromCredential(request: Request, credential: SurfaceCredential): RequestSurface {
  if (credential.mode === 'server') return credential.session ? 'browser' : 'agent';
  const site = request.headers.get('sec-fetch-site');
  if (site !== 'same-origin' && site !== 'same-site') return 'agent';
  return credential.originAllowed ? 'browser' : 'agent';
}

/** Records the surface after the existing middleware has validated the credential and origin. */
export function attachRequestSurface(request: Request, credential: SurfaceCredential): void {
  (request as SurfaceRequest)[requestDefinitionSurface] = surfaceFromCredential(request, credential);
}

/** Unclassified requests fail closed to the consumer surface. */
export function requestSurface(request: Request): RequestSurface {
  return (request as SurfaceRequest)[requestDefinitionSurface] ?? 'agent';
}
