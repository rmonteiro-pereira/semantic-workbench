import { actionLabel } from './helpers';

/** Who a rule's principal clause covers, in words. */
function principalWords(text: string): string {
  if (/principal\s+is\s+SW::Client/.test(text)) return 'agent clients';
  const group = /principal\s+in\s+SW::Group::"([^"]+)"/.exec(text);
  if (group) return `members of the group ${group[1]}`;
  if (/principal\s*==\s*SW::User::"/.test(text)) return 'one named person';
  if (/principal\s+is\s+SW::User/.test(text)) return 'people';
  return 'everyone';
}

/** The actions a rule names, as the labels the Roles matrix uses, or every action when it names none. */
function actionWords(text: string): string {
  const actions = [...text.matchAll(/SW::Action::"([^"]+)"/g)].map(match => actionLabel(match[1]));
  if (!actions.length) return 'every action';
  if (actions.length === 1) return actions[0];
  return `${actions.slice(0, -1).join(', ')} and ${actions.at(-1)}`;
}

/** Where a rule applies, when its resource clause narrows it. */
function resourceWords(text: string): string {
  if (/resource\s+is\s+SW::Workspace/.test(text)) return ' on the workspace';
  const project = /resource\s+in\s+SW::Project::"([^"]+)"/.exec(text);
  if (project) return ` in the project ${project[1]}`;
  return '';
}

/**
 * One plain sentence for what a Cedar rule allows or denies, read from its own text, such as
 * "Allows Read and Export for people on the workspace, when its condition holds." A rule whose
 * shape this cannot read says so instead of guessing.
 */
export function policySentence(text: string): string {
  const start = /^\s*(permit|forbid)\s*\(/m.exec(text);
  if (!start) return 'Read the rule text to see what it does.';
  // Who, what and where come from the rule's head only; its condition may name other principals.
  const headEnd = text.indexOf(')', start.index + start[0].length);
  const head = text.slice(start.index, headEnd);
  const verb = start[1] === 'permit' ? 'Allows' : 'Denies';
  const condition = /^\s*(when|unless)\s*\{/.test(text.slice(headEnd + 1)) ? ', when its condition holds' : '';
  return `${verb} ${actionWords(head)} for ${principalWords(head)}${resourceWords(head)}${condition}.`;
}
