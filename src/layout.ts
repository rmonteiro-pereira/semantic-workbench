export type Link = { source: string; target: string };
// Linear-time layered layout. Cyclic components get a deterministic starting node.
// Edges discovered after a node has been placed do not continually increase its rank.
export function layoutGraph(ids: string[], edges: Link[]) {
  const outgoing = new Map(ids.map(id => [id, [] as string[]]));
  const incoming = new Map(ids.map(id => [id, 0]));
  for (const e of edges) if(outgoing.has(e.source) && outgoing.has(e.target) && e.source !== e.target) {
    outgoing.get(e.source)!.push(e.target);
    incoming.set(e.target, incoming.get(e.target)! + 1);
  }
  const ranks = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) if (!incoming.get(id)) { ranks.set(id, 0); queue.push(id); }
  let head = 0;
  function drain() {
    while (head < queue.length) {
      const id = queue[head++];
      for (const target of outgoing.get(id)!) if (!ranks.has(target)) {
        ranks.set(target, ranks.get(id)! + 1); queue.push(target);
      }
    }
  }
  drain();
  for (const id of ids) if (!ranks.has(id)) { ranks.set(id, 0); queue.push(id); drain(); }
  // Wrap broad layers into short columns so a hub's neighbors do not form a
  // tall strip that becomes unreadable when fitted to the canvas.
  const maxRows=ids.length<=200?4:Math.ceil(Math.sqrt(ids.length));
  const counts=new Map<number,number>();
  let maxRank=0;
  for(const rank of ranks.values()){counts.set(rank,(counts.get(rank)??0)+1);maxRank=Math.max(maxRank,rank);}
  const columns=new Map<number,number>();let offset=0;
  for(let rank=0;rank<=maxRank;rank++){columns.set(rank,offset);offset+=Math.ceil((counts.get(rank)??0)/maxRows);}
  const rows = new Map<number, number>();
  return ids.map(id => { const rank = ranks.get(id)!; const row = rows.get(rank) ?? 0; rows.set(rank, row + 1); return {id, position: {x: (columns.get(rank)!+Math.floor(row/maxRows))*330, y: (row%maxRows)*150}}; });
}
