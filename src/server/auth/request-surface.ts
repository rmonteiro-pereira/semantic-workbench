// Carries the browser-versus-agent choice made from credentials at the existing access boundary.
const surfaces = new WeakMap<Request, RequestSurface>();
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
  surfaces.set(request, surfaceFromCredential(request, credential));
}

/** Unclassified requests fail closed to the consumer surface. */
export function requestSurface(request: Request): RequestSurface {
  return surfaces.get(request) ?? 'agent';
}
