import { layoutGraph } from './layout';
self.onmessage = (event) => { const {ids, edges} = event.data; self.postMessage(layoutGraph(ids, edges)); };
