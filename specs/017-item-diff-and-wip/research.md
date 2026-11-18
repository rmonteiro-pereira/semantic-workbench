# Address history in Git

Each project stores history in `.semantic-workbench-address-migrations.jsonl` at its root.
The dot prefix and product name follow the repository manifest, `.semantic-workbench.json`.
The JSON Lines suffix keeps the file outside the supported definition formats. A project
`.gitattributes` rule assigns the union merge driver to the root history file.

An immutable side reads the history blob at its selected commit. A working side reads the
saved copy next to its definitions. The comparison replays records in the destination that
are absent from the source by ID. It takes the destination's replay order from the records.
