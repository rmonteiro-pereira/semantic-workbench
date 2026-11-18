# Contract: the dependency manifest (`tessera-dependencies.json`)

A committed JSON file in the importing project's folder, written only by "Update dependencies".
UTF-8, two-space indent, LF, one final newline, keys sorted, no times and no machine paths. It is a
workbench file kind: the scanner lists it, validates it with its own schema and never treats it as an
invalid ontology.

```json
{
  "manifestVersion": 1,
  "root": "retail/ontology.yaml",
  "providers": [
    {
      "project": "finance",
      "ontology": "ontology.yaml",
      "repository": "finance-repo",
      "sameRepository": false,
      "commit": "<full commit id of the provider's published snapshot>",
      "tag": null,
      "choice": "latest",
      "interfaceHash": "sha256:…",
      "concepts": ["Currency", "Invoice"],
      "dependsOn": [
        { "project": "units", "commit": "<full commit id>", "interfaceHash": "sha256:…" }
      ]
    }
  ]
}
```

- `commit` is absent when `sameRepository` is true. The candidate publication snapshot then supplies the
  provider files and `interfaceHash` is checked against them.
- `choice` is `latest` or `pin`. A pin records its tag in `tag` when it was given as one.
- `dependsOn` lists the providers the provider itself needed, with the versions the provider's own
  manifest named. Two entries for one provider with different `commit` values anywhere in the closure
  fail the compile.
- `interfaceHash` is the SHA-256 of the canonical JSON of the provider's exported concepts and every
  concept they need, taken from the named commit.
- Publication needs the manifest to cover exactly the imports of the committed roots, and every named
  object to be readable by the person who publishes.

The first importing root in path order uses the top-level `root` and `providers`. Additional
importing roots in the same project use `additionalRoots`, a list of objects with those same two
fields. Projects with one root omit the list.

## Compile manifest additions (`manifestVersion` 2 of the bundle manifest of feature 011)

```json
{
  "units": [{ "root": "retail/ontology.yaml", "parts": ["retail/orders.yaml", "retail/returns.yaml"] }],
  "providers": [{ "project": "finance", "commit": "…", "interfaceHash": "sha256:…" }],
  "addressMap": [{ "from": "sw1:retail/orders.yaml#ontology:Retail/concept:Order", "to": "sw1:retail/ontology.yaml#ontology:Retail/concept:Order" }]
}
```

## Dependents registry (derived state, not committed)

`state/mesh/dependents.json`, one entry per published consumer: project, root, domain at the time of
publication, imported concept names per provider, resolved commit or "same repository", and the
publication commit it was derived from. It can be deleted and rebuilt from published snapshots. It holds
no counts and no person.
