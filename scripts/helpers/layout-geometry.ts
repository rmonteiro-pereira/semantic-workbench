import type {Page} from '@playwright/test';
// Layout assertions shared by the responsive and polish checks (FR-067, FR-071): no horizontal
// page scroll, no control cut off by the viewport or by a clipping ancestor (controls inside a
// scrollable container count as reachable), and no overlap between floating overlays and the
// controls they could cover. Each problem is a readable string, so failures say what and where.
export async function layoutProblems(page:Page,options:{overlays?:string[];ignore?:string}={}):Promise<string[]>{
 return page.evaluate(({overlays,ignore})=>{
  const out:string[]=[],vw=innerWidth,vh=innerHeight;
  const doc=document.documentElement;if(doc.scrollWidth>vw+1)out.push(`page scrolls horizontally (${doc.scrollWidth} > ${vw})`);
  const name=(el:Element)=>{const a=el.getAttribute('aria-label')||(el as HTMLElement).innerText?.trim().split('\n')[0]||el.getAttribute('placeholder')||'';return `${el.tagName.toLowerCase()}${el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/)[0]:''} "${a.slice(0,40)}"`;};
  const shown=(el:Element)=>{const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>=1&&r.height>=1;};
  // Content of a closed <details> keeps layout boxes in Chromium but is not shown. The React Flow
  // attribution link is a credit, not a working control, so an overlay may cover it.
  const skip='details:not([open]) > :not(summary),details:not([open]) > :not(summary) *,[inert] *,.react-flow__node *,.react-flow__node,.react-flow__edge,.react-flow__minimap *,.cm-editor *,[aria-hidden="true"] *,.sr-only,.react-flow__attribution a'+(ignore?','+ignore:'');
  // In full screen only the full-screen element (or the window-filling one) is on screen.
  const scope:ParentNode=document.fullscreenElement??document.querySelector('.window-fill')??document;
  const controls=[...scope.querySelectorAll('button,input:not([type=file]):not([type=hidden]),select,textarea,[role=tab],a[href]')].filter(el=>shown(el)&&!el.matches(skip));
  const scrolls=(s:CSSStyleDeclaration,axis:'x'|'y')=>/(auto|scroll)/.test(axis==='x'?s.overflowX:s.overflowY);
  for(const el of controls){
   const r=el.getBoundingClientRect();let reachableX=false,reachableY=false,clipped='';
   for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
    const s=getComputedStyle(p);
    if(scrolls(s,'x'))reachableX=true;if(scrolls(s,'y'))reachableY=true;
    const clipX=!reachableX&&/(hidden|clip)/.test(s.overflowX),clipY=!reachableY&&/(hidden|clip)/.test(s.overflowY);
    if(clipX||clipY){const pr=p.getBoundingClientRect();
     const outX=clipX&&(r.left<pr.left-1||r.right>pr.right+1),outY=clipY&&(r.top<pr.top-1||r.bottom>pr.bottom+1);
     const inside=r.right>pr.left&&r.left<pr.right&&r.bottom>pr.top&&r.top<pr.bottom;
     if((outX||outY)&&inside){clipped=`cut off by ${name(p)}`;break;}
     if(!inside){clipped='hidden';break;}
    }
    // A full-screen or fixed element escapes the clipping of its ancestors.
    if(p===document.fullscreenElement||s.position==='fixed')break;
   }
   if(clipped==='hidden')continue;
   if(clipped){out.push(`${name(el)} ${clipped}`);continue;}
   if(!reachableX&&(r.left<-1||r.right>vw+1))out.push(`${name(el)} outside the viewport horizontally (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`);
   if(!reachableY&&r.top<vh&&r.bottom>vh+1&&getComputedStyle(el).position!=='fixed')out.push(`${name(el)} cut off at the bottom of the viewport`);
  }
  // Floating overlays must not cover each other or any visible control outside themselves.
  const boxes=(overlays??[]).flatMap(sel=>[...document.querySelectorAll(sel)].filter(shown).map(el=>({sel,el,r:el.getBoundingClientRect()})));
  const hit=(a:DOMRect,b:DOMRect)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.el.contains(b.el)||b.el.contains(a.el))continue;if(hit(a.r,b.r))out.push(`overlay ${a.sel} overlaps ${b.sel}`);}
  // The part of a control its scrolling or clipping ancestors actually show (a toolbar strip
  // scrolled sideways hides part of its buttons; the hidden part cannot be covered).
  const shownRect=(el:Element)=>{let r=el.getBoundingClientRect(),left=r.left,top=r.top,right=r.right,bottom=r.bottom;
   for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowX!=='visible'||s.overflowY!=='visible'){const q=p.getBoundingClientRect();left=Math.max(left,q.left);top=Math.max(top,q.top);right=Math.min(right,q.right);bottom=Math.min(bottom,q.bottom);}if(s.position==='fixed')break;}
   return new DOMRect(left,top,Math.max(0,right-left),Math.max(0,bottom-top));};
  for(const o of boxes)for(const el of controls){if(o.el.contains(el)||el.contains(o.el))continue;const r=shownRect(el);if(r.width<1||r.height<1)continue;if(hit(o.r,r)){
   // Covered only if the overlay is drawn above the control at the overlap's centre.
   const x=(Math.max(o.r.left,r.left)+Math.min(o.r.right,r.right))/2,y=(Math.max(o.r.top,r.top)+Math.min(o.r.bottom,r.bottom))/2,top=document.elementFromPoint(x,y);
   if(top&&o.el.contains(top)&&!el.contains(top))out.push(`overlay ${o.sel} covers ${name(el)}`);}}
  return [...new Set(out)];
 },{overlays:options.overlays??[],ignore:options.ignore??''});
}
