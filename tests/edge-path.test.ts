import {test,expect} from 'bun:test';
import {pathMatchesEndpoints} from '../src/edge-path';
test('accepts routed curves only at their actual current handle coordinates',()=>{
 const route='M 10,20 C 30,40 50,60 70,80';
 expect(pathMatchesEndpoints(route,10,20,70,80)).toBe(true);
 expect(pathMatchesEndpoints(route,11,20,70,80)).toBe(false);
 expect(pathMatchesEndpoints(route,10,20,70,81)).toBe(false);
 expect(pathMatchesEndpoints(route,10,21,71,80)).toBe(false);
});
test('accepts orthogonal absolute routes and decimal endpoint tolerance',()=>{
 expect(pathMatchesEndpoints('M -5.5, .25 L 5, .25 Q 10, .25 10, 5 L 10, 30',-5.5,.25,10,30)).toBe(true);
 expect(pathMatchesEndpoints('M 0 0 L 100 200',.009,-.009,100.009,199.991)).toBe(true);
 expect(pathMatchesEndpoints('M 0 0 L 100 200',.011,0,100,200)).toBe(false);
 expect(pathMatchesEndpoints('M 0 0 L 100 200',0,0,100,200.011)).toBe(false);
});
test('supports SVG scientific notation and signs without separators',()=>{
 expect(pathMatchesEndpoints('M 1e2,-2E1 C 1,2 3,4 5e1,-.5',100,-20,50,-.5)).toBe(true);
 expect(pathMatchesEndpoints('M 1-2 L 3-4',1,-2,3,-4)).toBe(true);
});
test('rejects missing paths, relative commands, nonfinite inputs and missing endpoint pairs',()=>{
 for(const path of ['', 'M 10,20', 'm 10 20 l 30 40','M 10 20 l 30 40','M 10 20 L Infinity NaN', 'M 10 20 L 30 40 Z', 'M 10 20 H 30 V 40'])expect(pathMatchesEndpoints(path,10,20,30,40)).toBe(false);
 expect(pathMatchesEndpoints('M 0 0 L 1 1',NaN,0,1,1)).toBe(false);
 expect(pathMatchesEndpoints('M 0 0 L 1 1',0,0,1,Infinity)).toBe(false);
 expect(pathMatchesEndpoints('M 0 0 L 1 1',0,0,1,1,-1)).toBe(false);
});
test('rejects old geometry after either endpoint or entire business area moves',()=>{
 const old='M 100 200 C 120 200 280 400 300 400';
 expect(pathMatchesEndpoints(old,100,200,300,400)).toBe(true);
 expect(pathMatchesEndpoints(old,150,250,350,450)).toBe(false);
 expect(pathMatchesEndpoints(old,100,200,350,450)).toBe(false);
});
test('rejects absolute H/V/Z commands whose final numeric pair is not the endpoint',()=>{
 expect(pathMatchesEndpoints('M 10 20 H 30 V 40',10,20,30,40)).toBe(false);
 expect(pathMatchesEndpoints('M 10 20 L 30 40 Z',10,20,30,40)).toBe(false);
 expect(pathMatchesEndpoints('M 10 20 H 30 L 30 40',10,20,30,40)).toBe(false);
});
