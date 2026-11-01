# thmanyah (ثمانية)

The site's Arabic typeface: thmanyah sans (text) and thmanyah serif display
(titles), by thmanyah Publishing and Distribution. Loaded by `lib/fonts.ts`,
used through `app/fonts.css`.

Its licence (`LICENSE.pdf`) allows it in websites as part of the built
product, and forbids changing, redistributing or offering the files for
download. So:

- keep the files exactly as published (no subsetting, conversion or
  renaming): `tests/fonts.test.mjs` checks their checksums;
- never copy them into `public/` (served as plain downloads), never link to
  them from another site, and never add them to the Text Tool's fonts: those
  are embedded in the maps, SVG and PDF people export;
- other weights come from the official download (https://thmanyah.com).
