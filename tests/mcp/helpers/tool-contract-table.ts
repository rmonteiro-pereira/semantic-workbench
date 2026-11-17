// Reads the table of the tool contract so tests can compare the registry and the documentation with it.
import { readFileSync } from 'node:fs';

type ContractRow = { name: string; route: string; action: string; hints: boolean[]; retry: string };

/** The table of the tool contract, one entry per tool. */
export function contractRows(): ContractRow[] {
  const text = readFileSync('specs/006-mcp-server/contracts/mcp-tools.md', 'utf8');
  return text
    .split('\n')
    .filter(line => /^\| `[a-z_]+` \| `/.test(line))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim().replaceAll('`', ''));
      return { name: cells[1], route: cells[2], action: cells[3], hints: cells.slice(4, 8).map(cell => cell === 'true'), retry: cells[8] };
    });
}
