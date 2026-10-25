/** Reports the size of a pane and keeps it still while the pane is frozen. */
import { useEffect, useState, type RefObject } from 'react';

/** The width and height of a pane in pixels; 0 before the first measure. */
export type StageSize = { width: number; height: number };

/** Measures `ref` whenever it resizes. While `frozen`, resizes are noted but not reported, so a
 * panel that opens beside the canvas does not change what the canvas thinks it has to show. */
export function useStageSize(ref: RefObject<HTMLElement | null>, frozen = false): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || frozen) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      setSize(previous =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    measure();
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, frozen]);
  return size;
}
