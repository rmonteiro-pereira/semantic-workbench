// Checks that the audit log of a data folder has not been edited, reordered or cut short.
// Usage: bun scripts/audit-verify.ts [audit-folder] [--anchors mirrored.log] [--retention-days N]
// The folder defaults to state/audit under DATA_DIR. The mirrored log is a copy of the server's
// standard output: its month-closing records pin each month's last record, and every record in it
// must still be stored. With --anchors the log must hold at least one anchor.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseMirror,
  readStoredMonths,
  verifyAuditChain,
  type ChainBreak,
} from '../src/server/auth/audit';
import { dataLayout } from '../src/server/projects/paths';

const REASONS: Record<ChainBreak['reason'], string> = {
  unreadable: 'the record is not readable',
  'broken-link': 'the record does not continue the one before it',
  'anchor-mismatch': 'the last record of the month differs from the one the mirror recorded',
  'anchor-month-missing': 'the mirror recorded this month but its file is missing',
  'mirror-line-missing': 'the mirror saw this record but it is not stored',
};

function optionValue(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw Error(`${name} needs a value.`);
  return value;
}

function mirrorIn(file: string) {
  if (!existsSync(file)) throw Error(`There is no mirrored log at ${file}.`);
  return parseMirror(readFileSync(file, 'utf8'));
}

function main(args: string[]) {
  const anchorsFile = optionValue(args, '--anchors');
  const retention = optionValue(args, '--retention-days');
  const values = new Set([anchorsFile, retention]);
  const rest = args.filter(arg => !arg.startsWith('--') && !values.has(arg));
  const folder = rest[0] ?? join(dataLayout().state, 'audit');
  if (!existsSync(folder)) throw Error(`There is no audit folder at ${folder}.`);
  const mirror = anchorsFile ? mirrorIn(anchorsFile) : { anchors: [], records: [] };
  if (anchorsFile && mirror.anchors.length === 0) {
    console.error(`Audit log not verified: the mirrored log ${anchorsFile} holds no anchor.`);
    return 1;
  }
  const result = verifyAuditChain(readStoredMonths(folder), mirror.anchors, {
    mirrored: mirror.records,
    retentionDays: retention === undefined ? undefined : Number(retention),
  });
  if (result.ok) {
    console.log(`Audit log intact: ${result.records} records in ${result.months} months.`);
    return 0;
  }
  const where = result.line ? `${result.month}.jsonl line ${result.line}` : `${result.month}`;
  console.error(`Audit log broken at ${where}: ${REASONS[result.reason]}.`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
