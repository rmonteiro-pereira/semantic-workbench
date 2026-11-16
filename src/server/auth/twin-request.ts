// Builds credential-free requests from reviewed operation metadata rather than caller paths.
import { operationById } from './operation-inventory';
import { routeFor } from './route-actions';
import { REQUEST_LIMITS } from '../request';

/** Parameters, sorted query values and optional JSON body of an in-process operation. */
export type TwinRequestInput = {
  params: Record<string, string>;
  query?: Record<string, string | readonly string[]>;
  body?: unknown;
  signal?: AbortSignal;
};

function encodedSegment(value: string): string {
  if (!value || value === '.' || value === '..') throw new Error('Twin path parameters must remain addressable URL segments.');
  return encodeURIComponent(value);
}

function operationPath(template: string, params: Record<string, string>): string {
  const names = [...template.matchAll(/:([a-z]+)|\*/g)].map(match => match[1] ?? '*');
  if (Object.keys(params).some(name => !names.includes(name))) throw new Error('Unknown twin path parameter.');
  return template.replace(/:([a-z]+)|\*/g, (_match, name: string | undefined) => {
    const key = name ?? '*';
    const value = params[key];
    if (typeof value !== 'string') throw new Error(`Missing twin path parameter ${key}.`);
    if (key === '*') return value.split('/').map(encodedSegment).join('/');
    return encodedSegment(value);
  });
}

/** Builds an operation-bound request with no cookie, bearer, origin or forwarding headers. */
export function buildTwinRequest(operationId: string, input: TwinRequestInput): Request {
  const operation = operationById(operationId);
  if (!operation || operation.entry.dispatch !== 'twin') throw new Error(`Operation ${operationId} has no twin dispatch.`);
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
    body = JSON.stringify(input.body);
    if (body === undefined) throw new Error('Twin body must be JSON.');
    const limit = operation.entry.limits.request;
    if (limit === 'none' || Buffer.byteLength(body) > REQUEST_LIMITS[limit]) throw new Error(`Twin body exceeds ${operationId}'s request limit.`);
    headers.set('Content-Type', 'application/json');
  }
  const request = new Request(url, { method, headers, body, signal: input.signal });
  if (routeFor(method, new URL(request.url).pathname, 'server')?.row.path !== operation.row) throw new Error('Twin parameters changed the intended operation row.');
  return request;
}
