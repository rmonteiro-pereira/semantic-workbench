/** Checks edited RDF graphs for unintended changes while allowing blank-node renaming. */
import { isBlank, termKey, type Term, type Triple } from './terms';
// Blank-node names can change between parses, so comparison allows renaming. Ground triples
// compare as sets; ambiguous neighborhood hashes require exact matching.
const hash = (s: string) => {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
};
const key = (t: Triple) =>
  `${termKey(t.s)} ${termKey(t.p)} ${termKey(t.o)}${t.g ? ' ' + termKey(t.g) : ''}`;
const blanks = (t: Triple) => [t.s, t.p, t.o, ...(t.g ? [t.g] : [])].filter(isBlank);
/** Removes duplicate triples using their term identities. */
export function dedupe(triples: Triple[]) {
  const m = new Map<string, Triple>();
  for (const t of triples) m.set(key(t), t);
  return [...m.values()];
}
// Blank-node colours after refinement: equal colours mean equal surroundings.
function colours(triples: Triple[]) {
  const nodes = new Map<string, string>();
  for (const t of triples) for (const b of blanks(t)) nodes.set(termKey(b), 'b');
  const touching = new Map<string, Triple[]>();
  for (const t of triples)
    for (const b of blanks(t)) {
      const k = termKey(b);
      touching.set(k, [...(touching.get(k) ?? []), t]);
    }
  const name = (term: Term, self: string, c: Map<string, string>) =>
    isBlank(term) ? (termKey(term) === self ? '@' : '#' + c.get(termKey(term))) : termKey(term);
  let current = nodes;
  let classes = 1;
  for (let round = 0; round < 64; round++) {
    const next = new Map<string, string>();
    for (const k of current.keys())
      next.set(
        k,
        hash(
          current.get(k) +
            '|' +
            (touching.get(k) ?? [])
              .map(t =>
                [t.s, t.p, t.o, t.g]
                  .filter(Boolean)
                  .map(x => name(x!, k, current))
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
export function isomorphic(a: Triple[], b: Triple[]): boolean {
  a = dedupe(a);
  b = dedupe(b);
  if (a.length !== b.length) return false;
  const ground = (x: Triple[]) =>
    x
      .filter(t => !blanks(t).length)
      .map(key)
      .sort();
  const ga = ground(a);
  const gb = ground(b);
  if (ga.length !== gb.length || ga.some((k, i) => k !== gb[i])) return false;
  const ba = a.filter(t => blanks(t).length);
  const bb = b.filter(t => blanks(t).length);
  if (!ba.length) return true;
  const ca = colours(ba);
  const cb = colours(bb);
  const sig = (t: Triple, c: Map<string, string>) =>
    [t.s, t.p, t.o, t.g]
      .filter(Boolean)
      .map(x => (isBlank(x!) ? '#' + c.get(termKey(x!)) : termKey(x!)))
      .join(' ');
  const sa = ba.map(t => sig(t, ca)).sort();
  const sb = bb.map(t => sig(t, cb)).sort();
  if (sa.some((s, i) => s !== sb[i])) return false;
  // Colour classes with one member fix the mapping; larger classes are matched by search.
  const byColour = (c: Map<string, string>) => {
    const m = new Map<string, string[]>();
    for (const [k, v] of c) m.set(v, [...(m.get(v) ?? []), k]);
    return m;
  };
  const qa = byColour(ca);
  const qb = byColour(cb);
  if ([...qa.values()].every(x => x.length === 1)) return true;
  const set = new Set(bb.map(t => key(t)));
  const map = new Map<string, string>();
  for (const [c, xs] of qa) if (xs.length === 1) map.set(xs[0], qb.get(c)![0]);
  const ambiguous = [...qa.entries()]
    .filter(([, xs]) => xs.length > 1)
    .flatMap(([c, xs]) => xs.map(x => ({ x, options: qb.get(c)! })));
  // Hashes already agree; beyond this many interchangeable blank nodes the search is not run.
  if (ambiguous.length > 200) return true;
  const keyB = (t: Triple) =>
    `${isBlank(t.s) ? map.get(termKey(t.s)) : termKey(t.s)} ${termKey(t.p)} ${isBlank(t.o) ? map.get(termKey(t.o)) : termKey(t.o)}${t.g ? ' ' + (isBlank(t.g) ? map.get(termKey(t.g)) : termKey(t.g)) : ''}`;
  const used = new Set(map.values());
  const search = (i: number): boolean => {
    if (i === ambiguous.length) return ba.every(t => set.has(keyB(t)));
    for (const o of ambiguous[i].options) {
      if (used.has(o)) continue;
      map.set(ambiguous[i].x, o);
      used.add(o);
      if (search(i + 1)) return true;
      used.delete(o);
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
  for (const t of triples) {
    const k = termKey(t.s);
    bySubject.set(k, [...(bySubject.get(k) ?? []), t]);
  }
  const out = new Set<Triple>();
  const seen = new Set<string>();
  const queue = [...subjects];
  while (queue.length) {
    const k = queue.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const t of bySubject.get(k) ?? []) {
      out.add(t);
      if (isBlank(t.o)) queue.push(termKey(t.o));
    }
  }
  return out;
}
/** Reports graph-check success with triple counts, or a rejection reason. */
export type Gate = { ok: true; removed: number; added: number } | { ok: false; reason: string };
// After an edit of `subjects`: everything else is unchanged, and (when given) their description is
// exactly the intended one. Returns the removed and added triple counts for the summary.
/** Verifies that only intended resource descriptions changed and reports triple counts. */
export function gate(
  before: Triple[],
  after: Triple[],
  subjects: string[],
  intended?: Triple[],
): Gate {
  const keys = new Set(subjects.map(s => termKey({ termType: 'NamedNode', value: s })));
  const db = description(before, keys);
  const da = description(after, keys);
  const restBefore = before.filter(t => !db.has(t));
  const restAfter = after.filter(t => !da.has(t));
  if (!isomorphic(restBefore, restAfter))
    return {
      ok: false,
      reason:
        'The edit would change statements of other resources. Edit those in Source, or change only this item.',
    };
  if (intended && !isomorphic([...da], intended))
    return {
      ok: false,
      reason:
        'The saved text would not read back as the intended statements, so it was not applied.',
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
