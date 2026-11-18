// The loss report: what a compile dropped, listed by item, with counts and a digest that acceptance is bound to.

/** One value the compiler removed. The value itself is never stored, only its size and hash. */
export type LossEntry = {
  document: string;
  item: string;
  property: string;
  pointer: string;
  bytes: number;
  sha256: string;
};
