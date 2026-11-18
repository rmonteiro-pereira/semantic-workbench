# Contract: Tessera revision 2 additions and report version 2

Revision 2 adds three registry entries. All three have disposition `drop` and owner "attributes and
governance". Each is valid in a document that declares `tessera: 2` or higher.

## `tessera_attributes` (concept)

A list of distinct strings, at most 200 (assumed). Each string is the `name` of a relationship of the
same concept that is an attribute (one role, target a value type of the document or a built-in).

```yaml
- concept: Customer
  type: EntityType
  relationships:
    - { name: email, roles: [{ concept: String }], verbalizes: ["{Customer} has {email}"] }
    - { name: tier, roles: [{ concept: LoyaltyTier }], verbalizes: ["{Customer} has {tier}"] }
  tessera_attributes: [tier, email]
```

## `tessera_ai_context` (concept, relationship)

The same shapes as the standard `ai_context`: a string, or an object with `instructions` (string),
`synonyms` (strings) and `examples` (strings). Every text is at most 10,000 characters (assumed).

## `tessera_governance` (concept, relationship)

An object with at least one of these keys and no other key.

| Key | Value | Rule |
|---|---|---|
| `status` | `proposed`, `approved`, `deprecated` | missing means "not set" |
| `owner` | text, 1 to 200 characters | compared case-insensitively |
| `steward` | text, 1 to 200 characters | |
| `classification` | text, 1 to 200 characters | a level name or an admin alias; a declaration only |
| `replaced_by` | name of an item of the same kind | only with `deprecated` |
| `deprecation_reason` | text, 1 to 2,000 characters | only with `deprecated` |

## Finding codes (added to 011's list)

`tessera-attribute-order` (entry not an attribute, repeated or missing), `tessera-governance-value`
(unknown status, key outside the object, empty object), `tessera-governance-deprecation`
(`replaced_by` or reason without `deprecated`, or a replacement that does not exist),
`tessera-governance-duplicate` (two representations of one item's governance).

## Loss report version 2

`reportVersion` becomes 2. The object gains `statusCounts` only when a lost value is a
`tessera_governance` entry:

```json
"statusCounts": { "approved": 1, "deprecated": 0, "notSet": 2, "proposed": 1 }
```

Keys are sorted. Every key is present when the field is present. Each count is the number of lost
governance entries with that status. The field is part of the digest. A loss entry for a governance
value carries the same `item`, `property`, `pointer`, `bytes` and `sha256` fields as any other loss.
The compiler version becomes `1.1.0` (assumed; the plan fixes it when the golden files are made).
