/** Keeps recorded selection and neighborhood centers in the shared address grammar. */
import { useCallback, useRef } from 'react';
import { selectionAddress, selectionId, translateWalk, type SelectionDocument } from '../../graph/selection-addresses';
import { emptyWalk, reconcileWalk, type Walk } from '../../graph/walk';
import { useRecordedState } from './useRecordedState';

type Update<Value> = Value | ((previous: Value) => Value);

/** Exposes renderer keys while recording structured selections as document-qualified addresses. */
export function useGraphAddresses(current: string | undefined, documentOf: (id: string) => SelectionDocument | null) {
  const documents = useRef(documentOf);
  documents.current = documentOf;
  const currentDocument = useRef(current);
  currentDocument.current = current;
  const [selectedAddress, recordSelection] = useRecordedState('workbench.selected', '');
  const [addressWalk, recordWalk] = useRecordedState('neighborhood.walk', emptyWalk, reconcileWalk);
  const selectedDocument = current ? documentOf(current) : null;
  const selected = selectedDocument ? selectionId(selectedDocument, selectedAddress) : selectedAddress;
  const walk = translateWalk(addressWalk, documentOf, 'renderer');
  const setSelected = useCallback(
    (update: Update<string>) => {
      recordSelection(previous => {
        const document = currentDocument.current ? documents.current(currentDocument.current) : null;
        const rendererKey = document ? selectionId(document, previous) : previous;
        const next = typeof update === 'function' ? update(rendererKey) : update;
        return document ? selectionAddress(document, next) : next;
      });
    },
    [recordSelection],
  );
  const setWalk = useCallback(
    (update: Update<Walk>) => {
      recordWalk(previous => {
        const rendered = translateWalk(previous, documents.current, 'renderer');
        const next = typeof update === 'function' ? update(rendered) : update;
        return translateWalk(next, documents.current, 'address', previous);
      });
    },
    [recordWalk],
  );
  return { selected, setSelected, walk, setWalk };
}
