import { commaList } from './change-review';
import type { Action } from '../../server/auth/actions';
import type { PolicyTemplate } from './types';

/** What the template form collects; the server turns the request into Cedar text. */
export type PolicyParameters = {
  template: string;
  domain: string;
  groups: string;
  role: string;
  actions: string;
  branch: string;
  start: number;
  end: number;
  ranges: string;
};

/**
 * The UTC hours from `start` up to, not including, `end`. A start after the end is a window that
 * runs past midnight, such as 22 to 2. Equal hours would be an empty window and are refused.
 */
export function windowHours(start: number, end: number): number[] {
  if (start === end) throw new Error('Choose different start and end hours.');
  const hours: number[] = [];
  for (let hour = start; hour !== end; hour = (hour + 1) % 24) {
    if (hours.length === 24) break;
    hours.push(hour);
  }
  return hours;
}

/** Builds the template request for rule `id`; the server validates every value. */
export function templateRequest(parameters: PolicyParameters, id: string): PolicyTemplate {
  // The server checks that each action exists, so the text is passed through unchanged.
  const actions = commaList(parameters.actions) as Action[];
  if (parameters.template === 'Metric ownership and steward') {
    return {
      template: 'metric-ownership',
      id,
      domain: parameters.domain,
      groups: commaList(parameters.groups),
    };
  }
  if (parameters.template === 'Git action limits') {
    return {
      template: 'git-limits',
      id,
      actions,
      role: parameters.role,
      branch: parameters.branch,
    };
  }
  if (parameters.template === 'Time condition') {
    return { template: 'time', id, actions, hours: windowHours(parameters.start, parameters.end) };
  }
  return { template: 'network', id, actions, ranges: commaList(parameters.ranges) };
}
