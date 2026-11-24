# Quickstart: verifying Tessera

Run from the repository root with Bun. Each step names the proof behind it. Heavy runs go to the
development server with `sw-midgard-run -- <command>`.

## 1. Ordinary Ossie did not change

```sh
bun test tests/tessera/standard-unchanged.test.ts
```

Passes when every example, fixture and address case validates and inspects exactly as recorded
before this feature.

## 2. A Tessera ontology validates

```sh
bun test tests/tessera/validation.test.ts tests/tessera/schema-derivation.test.ts
```

Covers the marker, revisions, bases, the registry, every finding code and the strict-superset
property in both directions.

## 3. The workbench reads and saves it

```sh
bun test tests/tessera/workbench-documents.test.ts tests/tessera/operation-parity.test.ts
```

Covers inspection, the unchanged document type, item addresses, byte-exact saves, rejection of
invalid saves, agent context and parity of the save operations over HTTP and in-process.

## 4. The compiler

```sh
bun test tests/tessera/compile.test.ts tests/tessera/loss-report.test.ts tests/tessera/determinism.test.ts
```

Covers deletion-only output, the output checks, standard files passing through, the loss report and
its digest, acceptance by digest and by policy, and byte-identical output under shuffled input.

## 5. The command line, end to end

```sh
bun test tests/tessera/cli.test.ts
```

Builds a fixture repository in a temporary folder, commits a Tessera ontology, a standard semantic
model and a mapping, makes uncommitted changes, then runs `compile` without acceptance (status 2,
nothing written), with the digest (status 0, bundle written) and against a bad output folder
(status 1). It validates every output file against the pinned schema.

By hand, on any repository whose default branch holds Tessera files:

```sh
bun run tessera check --repository /path/to/repo
bun run tessera compile --repository /path/to/repo --out /tmp/bundle   # status 2 prints the digest
bun run tessera compile --repository /path/to/repo --out /tmp/bundle --accept-loss sha256:<digest>
ls /tmp/bundle
```

## 6. The browser shows it

```sh
bun run test:tessera
```

Opens a Tessera ontology in the editor, checks that findings appear in the validation panel and
that the format and base are named where the Ossie version is named, and that no control was added.

## 7. Mutants

```sh
bun test tests/tessera/mutant-anchors.test.ts
```

Checks that every Tessera mutant still finds its anchor text in its file and that each mutant has a
test case that exercises it. The slow run of every mutant (`bun run test:mutation`) belongs to the
batch gate.

## 8. The batch gate

The full unit suite, all mutation tests and every browser suite run once on the integrated batch
before the merge. A feature run is limited to its own tests, `bun --bun run check` and
`bun --bun run build`.
