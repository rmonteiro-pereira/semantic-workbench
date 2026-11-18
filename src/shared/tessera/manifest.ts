// The manifest that stands beside a bundle: where the sources came from, what was read and written, and how the loss was accepted.
import { canonicalJson } from './canonical-json';
import type { CompileResult, MeshManifestFields } from './compile-unit';
import type { Acceptance, LossReport } from './loss-report';

/** Where the compiled files came from. Files on disk carry no commit and are never published. */
export type ManifestSource = { kind: 'published-snapshot' | 'snapshot' | 'files-on-disk'; branch?: string; commit?: string; projectFolder?: string };

/** The manifest of a bundle. It says nothing about approval of the exported content. */
export type Manifest = ({ manifestVersion: 1 } | ({ manifestVersion: 2 } & MeshManifestFields)) & {
  compiler: LossReport['compiler'];
  source: ManifestSource;
  base: LossReport['base'];
  tesseraRevisions: number[];
  inputs: LossReport['inputs'];
  outputs: LossReport['outputs'];
  loss: { digest: string; accepted: Acceptance };
  lossPolicySha256: string | null;
};

/** Builds the manifest from a compile result; it repeats the report's lists so it stands alone. */
export function buildManifest(result: CompileResult, source: ManifestSource, accepted: Acceptance): Manifest {
  const { report } = result;
  return {
    ...(result.mesh ? { manifestVersion: 2 as const, ...result.mesh } : { manifestVersion: 1 as const }),
    compiler: report.compiler,
    source,
    base: report.base,
    tesseraRevisions: result.tesseraRevisions,
    inputs: report.inputs,
    outputs: report.outputs,
    loss: { digest: report.digest, accepted },
    lossPolicySha256: report.options.lossPolicy,
  };
}

/** Prints the manifest the way it is stored. */
export function printManifest(manifest: Manifest): string {
  return canonicalJson(manifest);
}
