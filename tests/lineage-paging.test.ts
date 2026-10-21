import {test,expect} from 'bun:test';
import {pageColumns,moreRowId,PAGE_SIZE,type LineageCard} from '../src/odcs/lineage';
// Paging (T027, FR-006): ten rows per page, path rows pinned above the page, and an edge to a
// column that is not shown attaches to the card's "N more columns" row.
const card:LineageCard={id:'object:c#big',kind:'object',label:'big',file:'c',columns:Array.from({length:23},(_,i)=>({id:`object:c#big/c${i}`,path:`c${i}`,badges:[]}))};
test('ten rows per page and the page count',()=>{
 const p=pageColumns(card,0,new Set());expect(PAGE_SIZE).toBe(10);expect(p.pages).toBe(3);expect(p.rows.map(r=>r.path)).toEqual(Array.from({length:10},(_,i)=>`c${i}`));expect(p.hidden).toBe(13);
 expect(pageColumns(card,2,new Set()).rows.map(r=>r.path)).toEqual(['c20','c21','c22']);
 expect(pageColumns(card,9,new Set()).page).toBe(2);expect(pageColumns(card,-1,new Set()).page).toBe(0);
});
test('columns on a highlighted path are pinned above the current page',()=>{
 const p=pageColumns(card,0,new Set(['object:c#big/c15','object:c#big/c3']));
 expect(p.rows.map(r=>r.path)).toEqual(['c15',...Array.from({length:10},(_,i)=>`c${i}`)]);expect(p.pinned).toEqual(['object:c#big/c15']);expect(p.hidden).toBe(12);
});
test('an off-page column maps to the "more" row; visible ones and other cards map to themselves',()=>{
 const p=pageColumns(card,0,new Set());
 expect(p.port('object:c#big/c4')).toBe('object:c#big/c4');expect(p.port('object:c#big/c17')).toBe(moreRowId(card.id));
 expect(p.port('object:c#other/x')).toBe('object:c#other/x');expect(p.port(card.id)).toBe(card.id);
});
