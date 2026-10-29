/** Checks edited RDF graphs for unintended changes while allowing blank-node renaming. */
import { isBlank, termKey, type Term, type Triple } from './terms';
// Blank-node names can change between parses, so comparison allows renaming. Ground triples
// compare as sets; ambiguous neighborhood hashes require exact matching.
const hash = (text: string) => {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
};
const key = (t: Triple) => `${termKey(t.s)} ${termKey(t.p)} ${termKey(t.o)}${t.g ? ' ' + termKey(t.g) : ''}`;
const blanks = (t: Triple) => [t.s, t.p, t.o, ...(t.g ? [t.g] : [])].filter(isBlank);
/** Removes duplicate triples using their term identities. */
export function dedupe(triples: Triple[]) {
  const lookup = new Map<string, Triple>();
  for (const triple of triples) lookup.set(key(triple), triple);
  return [...lookup.values()];
}
// Blank-node colours after refinement: equal colours mean equal surroundings.
function colours(triples: Triple[]) {
  const nodes = new Map<string, string>();
  for (const triple of triples) for (const term of blanks(triple)) nodes.set(termKey(term), 'b');
  const touching = new Map<string, Triple[]>();
  for (const triple of triples)
    for (const term of blanks(triple)) {
      const blankKey = termKey(term);
      touching.set(blankKey, [...(touching.get(blankKey) ?? []), triple]);
    }
  const name = (term: Term, self: string, c: Map<string, string>) => {
    if (isBlank(term)) {
      if (termKey(term) === self) {
        return '@';
      }
      return '#' + c.get(termKey(term));
    }
    return termKey(term);
  };
  let current = nodes;
  let classes = 1;
  for (let round = 0; round < 64; round++) {
    const next = new Map<string, string>();
    for (const blankKey of current.keys())
      next.set(
        blankKey,
        hash(
          current.get(blankKey) +
            '|' +
            (touching.get(blankKey) ?? [])
              .map(triple =>
                [triple.s, triple.p, triple.o, triple.g]
                  .filter(Boolean)
                  .map(x => name(x!, blankKey, current))
                  .join(' '),
              )
              .sort()
              .join('\n'),
        ),
      );
    const count = new Set(next.values()).size;
    current = next;
    if (count === classes) break;
    classes = count;
  }
  return current;
}
/** Compares RDF graphs while allowing blank-node identifiers to differ. */
export function isomorphic(leftTriples: Triple[], rightTriples: Triple[]): boolean {
  const left = dedupe(leftTriples);
  const right = dedupe(rightTriples);
  if (left.length !== right.length) return false;
  const ground = (x: Triple[]) =>
    x
      .filter(t => !blanks(t).length)
      .map(key)
      .sort();
  const ga = ground(left);
  const gb = ground(right);
  if (ga.length !== gb.length || ga.some((k, i) => k !== gb[i])) return false;
  const ba = left.filter(t => blanks(t).length);
  const bb = right.filter(t => blanks(t).length);
  if (!ba.length) return true;
  const ca = colours(ba);
  const cb = colours(bb);
  const sig = (triple: Triple, lookup: Map<string, string>) =>
    [triple.s, triple.p, triple.o, triple.g]
      .filter(Boolean)
      .map(x => (isBlank(x!) ? '#' + lookup.get(termKey(x!)) : termKey(x!)))
      .join(' ');
  const sa = ba.map(t => sig(t, ca)).sort();
  const sb = bb.map(t => sig(t, cb)).sort();
  if (sa.some((s, i) => s !== sb[i])) return false;
  // Colour classes with one member fix the mapping; larger classes are matched by search.
  const byColour = (lookup: Map<string, string>) => {
    const nodesByColour = new Map<string, string[]>();
    for (const [nodeKey, colour] of lookup) nodesByColour.set(colour, [...(nodesByColour.get(colour) ?? []), nodeKey]);
    return nodesByColour;
  };
  const qa = byColour(ca);
  const qb = byColour(cb);
  if ([...qa.values()].every(x => x.length === 1)) return true;
  const set = new Set(bb.map(t => key(t)));
  const map = new Map<string, string>();
  for (const [colour, xs] of qa) if (xs.length === 1) map.set(xs[0], qb.get(colour)![0]);
  const ambiguous = [...qa.entries()].filter(([, xs]) => xs.length > 1).flatMap(([c, xs]) => xs.map(x => ({ x, options: qb.get(c)! })));
  // Hashes already agree; beyond this many interchangeable blank nodes the search is not run.
  if (ambiguous.length > 200) return true;
  // Blank nodes of the second graph are renamed to their candidate match in the first.
  const mappedKey = (term: Term) => (isBlank(term) ? map.get(termKey(term)) : termKey(term));
  const keyB = (t: Triple) => {
    const graphPart = t.g ? ' ' + mappedKey(t.g) : '';
    return `${mappedKey(t.s)} ${termKey(t.p)} ${mappedKey(t.o)}${graphPart}`;
  };
  const used = new Set(map.values());
  const search = (i: number): boolean => {
    if (i === ambiguous.length) return ba.every(t => set.has(keyB(t)));
    for (const option of ambiguous[i].options) {
      if (used.has(option)) continue;
      map.set(ambiguous[i].x, option);
      used.add(option);
      if (search(i + 1)) return true;
      used.delete(option);
      map.delete(ambiguous[i].x);
    }
    return false;
  };
  return search(0);
}
// A resource's description: its triples, and the blank nodes it reaches with theirs (nested
// property lists, restrictions, collections), which are edited as a whole with it.
/** Collects subjects' triples and the blank-node descriptions they reach. */
export function description(triples: Triple[], subjects: Set<string>): Set<Triple> {
  const bySubject = new Map<string, Triple[]>();
  for (const triple of triples) {
    const subjectKey = termKey(triple.s);
    bySubject.set(subjectKey, [...(bySubject.get(subjectKey) ?? []), triple]);
  }
  const out = new Set<Triple>();
  const seen = new Set<string>();
  const queue = [...subjects];
  while (queue.length) {
    const subjectKey = queue.pop()!;
    if (seen.has(subjectKey)) continue;
    seen.add(subjectKey);
    for (const triple of bySubject.get(subjectKey) ?? []) {
      out.add(triple);
      if (isBlank(triple.o)) queue.push(termKey(triple.o));
    }
  }
  return out;
}
/** Reports graph-check success with triple counts, or a rejection reason. */
export type Gate = { ok: true; removed: number; added: number } | { ok: false; reason: string };
// After an edit of `subjects`: everything else is unchanged, and (when given) their description is
// exactly the intended one. Returns the removed and added triple counts for the summary.
/** Verifies that only intended resource descriptions changed and reports triple counts. */
export function gate(before: Triple[], after: Triple[], subjects: string[], intended?: Triple[]): Gate {
  const keys = new Set(subjects.map(s => termKey({ termType: 'NamedNode', value: s })));
  const db = description(before, keys);
  const da = description(after, keys);
  const restBefore = before.filter(t => !db.has(t));
  const restAfter = after.filter(t => !da.has(t));
  if (!isomorphic(restBefore, restAfter))
    return {
      ok: false,
      reason: 'The edit would change statements of other resources. Edit those in Source, or change only this item.',
    };
  if (intended && !isomorphic([...da], intended))
    return {
      ok: false,
      reason: 'The saved text would not read back as the intended statements, so it was not applied.',
    };
  const kb = new Set([...db].filter(t => !blanks(t).length).map(key));
  const ka = new Set([...da].filter(t => !blanks(t).length).map(key));
  const blankBefore = [...db].filter(t => blanks(t).length).length;
  const blankAfter = [...da].filter(t => blanks(t).length).length;
  const same = isomorphic(
    [...db].filter(t => blanks(t).length),
    [...da].filter(t => blanks(t).length),
  );
  return {
    ok: true,
    removed: [...kb].filter(k => !ka.has(k)).length + (same ? 0 : blankBefore),
    added: [...ka].filter(k => !kb.has(k)).length + (same ? 0 : blankAfter),
  };
}
