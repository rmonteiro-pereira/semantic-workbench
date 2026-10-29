/** Manages inspector focus, keyboard shortcuts, and canvas fullscreen behavior. */
import React, { useEffect, useRef, useState } from 'react';
import { useFullscreen } from '../../graph/fullscreen';
import type { Entity, Relationship } from '../../../shared/core/model';
import type { ValidatedModel } from '../types';

type Options = {
  tab: string;
  entity: Entity | undefined;
  relationship: Relationship | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  model: ValidatedModel;
  latest: React.RefObject<() => void>;
};
/** Manages inspector. */
export function useInspector({ tab, entity, relationship, setSelected, setSelectedEdge, model, latest }: Options) {
  // "e" opens the editor of the selected item (outside text fields and dialogs).
  // Full screen for Graph and Neighborhood: the canvas row (graph and details) fills the screen.
  const inspectorVisible = tab !== 'mappings' && tab !== 'metrics' && !!(entity || relationship);
  const [phone, setPhone] = useState(() => window.innerWidth <= 650);
  useEffect(() => {
    const update = () => setPhone(window.innerWidth <= 650);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const pageDetails = phone && inspectorVisible && (tab === 'overview' || tab === 'catalog');
  const canvasRow = useRef<HTMLDivElement | null>(null);
  const graphView = tab === 'fullgraph' || tab === 'neighborhood';
  useEffect(() => {
    if (!pageDetails) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = canvasRow.current?.querySelector<HTMLElement>('.inspector');
    panel?.querySelector<HTMLButtonElement>('.inspector-close')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected('');
        setSelectedEdge('');
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]')).filter(el => el.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, [pageDetails]);
  const fullscreen = useFullscreen(canvasRow, graphView && !!model);
  const toggleFull = useRef(() => {});
  toggleFull.current = fullscreen.toggle;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (e.key !== 'f' || e.ctrlKey || e.metaKey || e.altKey || element.closest('input,textarea,select,[contenteditable=true],dialog,.cm-editor')) return;
      e.preventDefault();
      toggleFull.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const elementValue = e.target as HTMLElement;
      if (e.key !== 'e' || e.ctrlKey || e.metaKey || e.altKey || elementValue.closest('input,textarea,select,[contenteditable=true],dialog')) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return { canvasRow, inspectorVisible, pageDetails, fullscreen };
}
