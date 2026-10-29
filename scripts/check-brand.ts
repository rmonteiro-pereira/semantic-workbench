// Fails when the product name or logo is written into code instead of read from the brand
// bundle in public/brand. A deployment replaces that bundle (SW_BRAND_DIR), so anything that
// shows the name or the logo must take it from there.
//
//   bun scripts/check-brand.ts            check src, server, index.html and public
//   bun scripts/check-brand.ts <paths>    check only the given files or folders
//
// What counts as a hard-coded brand (one rule each):
//   product-name  the text "Semantic Workbench", in code, markup or comments
//   wordmark      the split "semantic" + "WORKBENCH" wordmark, or its brand-sub style class
//   logo-path     the path data of the inline layers logo
//
// What is not scanned: public/brand (the defaults themselves), public/examples (stored unmodified),
// src/generated (schema validators compiled from the schemas), and everything outside src,
// index.html and public: tests, scripts, specs and documentation may name the product.
// Identifiers such as "semantic-workbench/metric/v1" or SEMANTIC_WORKBENCH do not match.
//
// The small allow-list below holds technical identities that must not change with the brand:
// each entry names one file, one rule and the reason.
import { readFileSync } from 'node:fs';
import { walkFiles } from './helpers/walk-files';

/** The rules this check applies, by the name printed with a violation. */
type BrandRule = 'product-name' | 'wordmark' | 'logo-path';

/** One hard-coded brand found in a file. */
export type BrandViolation = { file: string; line: number; rule: BrandRule };

const RULES: { rule: BrandRule; pattern: RegExp }[] = [
  { rule: 'product-name', pattern: /Semantic Workbench/ },
  { rule: 'wordmark', pattern: /semantic\s*<[^>]*>\s*WORKBENCH|brand-sub/ },
  { rule: 'logo-path', pattern: /M12\.83 2\.18/ },
];

// Technical identities. The committer of server commits is stored in every repository's history,
// so a brand swap must not rewrite it; an operator changes it with SW_COMMITTER_NAME instead.
const ALLOWED: { file: string; rule: BrandRule; reason: string }[] = [
  { file: 'src/server/config.ts', rule: 'product-name', reason: 'default of SW_COMMITTER_NAME' },
  {
    file: 'src/server/projects/git.ts',
    rule: 'product-name',
    reason: 'service committer identity',
  },
  {
    file: 'src/server/auth/admin-repo.ts',
    rule: 'product-name',
    reason: 'committer of the policy repo',
  },
  {
    file: 'src/server/projects/migration.ts',
    rule: 'product-name',
    reason: 'fixed import commit text',
  },
  {
    file: 'src/server/agent/explain.ts',
    rule: 'product-name',
    reason: 'agent reply text pinned by a digest test',
  },
  {
    file: 'src/server/agent/runtime.ts',
    rule: 'product-name',
    reason: 'agent reply text pinned by a digest test',
  },
  {
    file: 'src/server/projects/worktrees.ts',
    rule: 'product-name',
    reason: 'lock reason kept in Git',
  },
];

const SCANNED_PATHS = ['src', 'index.html', 'public'];
const SKIPPED_PATHS = ['public/brand', 'public/examples', 'src/generated'];
const TEXT_FILE = /\.(?:ts|tsx|js|mjs|css|html|json|svg|webmanifest)$/;

function isSkipped(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return SKIPPED_PATHS.some(
    skipped => normalized === skipped || normalized.startsWith(skipped + '/'),
  );
}

function isAllowed(file: string, rule: BrandRule): boolean {
  return ALLOWED.some(entry => entry.file === file && entry.rule === rule);
}

/** Returns the hard-coded brands in one file's text; empty for an allow-listed use. */
export function brandViolationsIn(file: string, text: string): BrandViolation[] {
  const found: BrandViolation[] = [];
  text.split('\n').forEach((line, index) => {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(line) && !isAllowed(file, rule)) {
        found.push({ file, line: index + 1, rule });
      }
    }
  });
  return found;
}

/** Returns every violation in the given paths, in file order. */
export function brandViolations(paths: string[] = SCANNED_PATHS): BrandViolation[] {
  const files = walkFiles(paths, file => TEXT_FILE.test(file) && !isSkipped(file));
  return files.flatMap(file => {
    const normalized = file.replaceAll('\\', '/');
    return brandViolationsIn(normalized, readFileSync(file, 'utf8'));
  });
}

/** Prints one `file:line` per violation and returns the process exit code. */
export function runBrandCheck(paths?: string[]): number {
  const violations = brandViolations(paths);
  if (!violations.length) {
    console.log('No product name or logo is hard-coded outside public/brand.');
    return 0;
  }
  for (const { file, line, rule } of violations) {
    console.error(`${file}:${line}  hard-coded brand (${rule}); read it from the brand bundle`);
  }
  console.error(
    `${violations.length} hard-coded brand uses. Take the name from useBrand() or the active ` +
      'brand on the server, and the logo from /brand/logo.svg.',
  );
  return 1;
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  process.exit(runBrandCheck(paths.length ? paths : undefined));
}
