// Builds the files of one bundle: the compiled outputs, the manifest and the loss report. The command line and the HTTP download both call this, so their bytes are equal.
import type { CompileResult, UnitFile } from '../../shared/tessera/compile-unit';
import { printReport, type Acceptance } from '../../shared/tessera/loss-report';
import { buildManifest, printManifest, type ManifestSource } from '../../shared/tessera/manifest';

const encoder = new TextEncoder();

/** The files of a bundle in the order they are written: outputs, then the manifest, then the report. */
export function bundleFiles(result: CompileResult, source: ManifestSource, accepted: Acceptance): UnitFile[] {
  const manifest = buildManifest(result, source, accepted);
  return [...result.outputs, { path: 'manifest.json', bytes: encoder.encode(printManifest(manifest)) }, { path: 'loss-report.json', bytes: encoder.encode(printReport(result.report, source)) }];
}
