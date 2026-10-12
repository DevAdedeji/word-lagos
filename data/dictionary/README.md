# WordPadi English supplement

699 reviewed additions to `word-list` 4.1.0, selected from SCOWL's recommended
size-60 English list. This adds modern and everyday words while retaining every
word already accepted by WordPadi. It is not Collins or NASPA compatibility.

Source: https://github.com/en-wl/wordlist/releases/tag/rel-2026.02.25
Pinned commit: `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`.
SCOWL is now also called the English Speller Database (ESDB).
The unmodified upstream notice is in `SCOWL-Copyright.txt` and is bundled in
`/dictionary-license.txt`. It permits use, modification, distribution and sale
with attribution. The repository's original `word-list` MIT notice is retained.

## Reproducing the source candidates

Check out the pinned upstream commit, run `make`, then:

```sh
./scowl word-list 60 A,B,Z,C 1 --categories= --wo-poses=abbr \
  '--wo-pos-classes=person,surname,place,name,demonym,trademark,abbr,upper,name?,upper?,abbr?' \
  --wo-pos-categories=nonword,special,wordpart \
  --wo-usage-notes=offensive-1,offensive-2,offensive-3,vulgar-1,vulgar-2,vulgar-3 \
  > candidates.txt
```

Retain only lowercase ASCII words of 2–15 letters, without stripping punctuation
or lowercasing proper names. Remove words already in `word-list` 4.1.0. This
produces 1,111 candidate additions. The checked-in `english-supplement.txt` is a
reviewed selection of 699 of those candidates; it is intentionally not the entire
candidate list. Upstream tags are incomplete, so they are not sufficient on their
own to filter names, abbreviations, offensive words or questionable spellings.
No claim is made that the combined legacy dictionary is fully moderated.

Supplement SHA-256:
`9002c3b9b8cf52e752f2ba9d956ff8b0198822134ca5fc66607615d158d3e44e`

Normal builds need no external download or Python toolchain. `npm run dictionary`
merges the checked-in supplement with the pinned package, validates the word
shape, deduplicates, sorts and emits the same file used by all game consumers.
Change the dictionary version and review save compatibility for future updates.
