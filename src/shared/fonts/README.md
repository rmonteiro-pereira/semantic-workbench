# Bundled fonts

DM Sans and Manrope are distributed under the SIL Open Font License 1.1. Their complete
upstream variable webfonts include Latin and extended Latin characters; no local subsetting
or conversion is applied. The separate licence files retain the upstream copyright notices.

| Family | Font version | Upstream snapshot | File | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| DM Sans | 4.004 | [googlefonts/dm-fonts, 4412393](https://github.com/googlefonts/dm-fonts/tree/4412393b7d2de9fe7a92064c2dce9b5af5d7fd26/Sans) | dm-sans-variable.woff2 | 91896 | `0add1329f56a835a5df780b431ece97fff8b2a2deaa930aee93f1d4b9f3b2f5e` |
| Manrope | 4.505 | [googlefonts/manrope, 468c0db](https://github.com/googlefonts/manrope/tree/468c0dbe38efa331b80bfe9448256abe27be44c3) | manrope-variable.woff2 | 53892 | `30b83738add8c9edd9e3450b98036a9a8fb5668d0cbd4eb0ce5fe6761197f21f` |

Download URLs:

- [DM Sans variable WOFF2](https://raw.githubusercontent.com/googlefonts/dm-fonts/4412393b7d2de9fe7a92064c2dce9b5af5d7fd26/Sans/fonts/webfonts/DMSans%5Bopsz,wght%5D.woff2)
- [Manrope variable WOFF2](https://raw.githubusercontent.com/googlefonts/manrope/468c0dbe38efa331b80bfe9448256abe27be44c3/fonts/webfonts/Manrope%5Bwght%5D.woff2)
- [DM Sans licence](https://raw.githubusercontent.com/googlefonts/dm-fonts/4412393b7d2de9fe7a92064c2dce9b5af5d7fd26/Sans/OFL.txt)
- [Manrope licence](https://raw.githubusercontent.com/googlefonts/manrope/468c0dbe38efa331b80bfe9448256abe27be44c3/OFL.txt)

These upstream repositories publish complete variable WOFF2 files rather than separate Latin
and Latin-extended release assets. Manrope has no GitHub release assets; the DM Sans release
archive predates this variable font. The immutable repository snapshots identify the exact
versions above. Neither snapshot publishes SHA-256 manifests. The file bytes match the Git
blob identities in each upstream tree; the SHA-256 values above are local integrity digests,
not claims of publisher-signed checksums.

To replace a family, retain its licence and provenance, update its `@font-face` URL and weight
range in `fonts.css`, and update `--font-sans` or `--font-display`. Run `sha256sum
src/shared/fonts/*.woff2`, `bun test tests/fonts.test.ts` and the theme browser check.
