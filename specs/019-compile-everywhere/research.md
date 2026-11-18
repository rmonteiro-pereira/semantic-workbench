# Release research

## Ossie 0.3.0 — 2026-11-18

No stable Ossie 0.3.0 release exists in the official Apache repository's release or tag lists.
The development schema declares `0.3.0.dev0`; it is not a stable release and is not adopted.
T025–T033 remain open. The supported base remains the pinned Ossie 0.2.0.dev0 draft.

Only the official [Apache Ossie repository](https://github.com/apache/ossie) was used.
The main revision reported by its API was `a0d15d29e9c90f65e0978b8bb32619fd4ef42c5c`.

Commands and observed output:

```sh
gh api repos/apache/ossie/releases --paginate --jq '[.[] | {tag_name, name, draft, prerelease, published_at}]'
```

```json
[]
```

```sh
gh api repos/apache/ossie/tags --paginate --jq '[.[] | {name, commit: .commit.sha}]'
```

```json
[{"commit":"faf581054dcf7964d5fe0ceae7d6f415c8ce32a5","name":"osi-0.1.1-rc1"}]
```

The official core schema's `properties.version`:

```json
{
  "type": "string",
  "const": "0.3.0.dev0",
  "description": "Apache Ossie specification version"
}
```

Source: [core schema at the recorded revision](https://github.com/apache/ossie/blob/a0d15d29e9c90f65e0978b8bb32619fd4ef42c5c/core-spec/ossie-schema.json).
The schema has no top-level `version`; its declared document version is `properties.version.const`.
The releases API returned zero entries; the tags API returned only the release-candidate tag above.
Neither a development schema nor a release candidate meets the stable-release prerequisite.
