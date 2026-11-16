// Builds credential-free requests from reviewed operation metadata rather than caller paths.
import { operationById } from './operation-inventory';
import { routeFor } from './route-actions';
import { REQUEST_LIMITS } from '../request';
import { BadRequestError } from '../projects/errors';

/** Parameters, sorted query values and optional JSON body of an in-process operation. */
export type TwinRequestInput = {
  params: Record<string, string>;
  query?: Record<string, string | readonly string[]>;
  body?: unknown;
  signal?: AbortSignal;
};

function encodedSegment(value: string): string {
  if (!value || value === '.' || value === '..') throw new BadRequestError('Twin path parameters must remain addressable URL segments.');
  try {
    return encodeURIComponent(value);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    throw new BadRequestError('Twin path parameters must contain valid Unicode.');
  }
}

function operationPath(template: string, params: Record<string, string>): string {
  const names = [...template.matchAll(/:([a-z]+)|\*/g)].map(match => match[1] ?? '*');
  if (Object.keys(params).some(name => !names.includes(name))) throw new BadRequestError('Unknown twin path parameter.');
  return template.replace(/:([a-z]+)|\*/g, (_match, name: string | undefined) => {
    const key = name ?? '*';
    const value = params[key];
    if (typeof value !== 'string') throw new BadRequestError(`Missing twin path parameter ${key}.`);
    if (key === '*') return value.split('/').map(encodedSegment).join('/');
    return encodedSegment(value);
  });
}

/** Builds an operation-bound request with no cookie, bearer, origin or forwarding headers. */
export function buildTwinRequest(operationId: string, input: TwinRequestInput): Request {
  const operation = operationById(operationId);
  if (!operation || operation.entry.dispatch !== 'twin') throw new BadRequestError(`Operation ${operationId} has no twin dispatch.`);
  const separator = operation.row.indexOf(' ');
  const method = operation.row.slice(0, separator);
  const path = operationPath(operation.row.slice(separator + 1), input.params);
  const url = new URL(path, 'http://operation.internal');
  for (const key of Object.keys(input.query ?? {}).sort()) {
    const value = input.query![key];
    for (const item of typeof value === 'string' ? [value] : value) url.searchParams.append(key, item);
  }
  const headers = new Headers();
  let body: string | undefined;
  if (input.body !== undefined) {
    if (method === 'GET' || method === 'HEAD') throw new BadRequestError(`Operation ${operationId} does not accept a body.`);
    try {
      body = JSON.stringify(input.body);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new BadRequestError('Twin body must be JSON.');
    }
    if (body === undefined) throw new BadRequestError('Twin body must be JSON.');
    const limit = operation.entry.limits.request;
    if (limit === 'none' || Buffer.byteLength(body) > REQUEST_LIMITS[limit]) throw new BadRequestError(`Twin body exceeds ${operationId}'s request limit.`);
    headers.set('Content-Type', 'application/json');
  }
  const request = new Request(url, { method, headers, body, signal: input.signal });
  if (routeFor(method, new URL(request.url).pathname, 'server')?.row.path !== operation.row) throw new BadRequestError('Twin parameters changed the intended operation row.');
  return request;
}
