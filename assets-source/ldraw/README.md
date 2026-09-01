# LDraw source assets

These `.dat` files are the minimum dependency closure for the special parts in
`../manifest.json`. They come from the LDraw official parts library, except
`7096.dat` and `s/7096s01.dat`, which are marked `Unofficial_Part` by LDraw.

LDraw is a community-run CAD system representing LEGO parts. Each file keeps
its own `!LICENSE` header; the included `CAreadme.txt` is the corresponding
license notice. Source pages are recorded in `assets-source/manifest.json`.

The files are parsed at build time into deterministic GLB assets. The runtime
does not fetch the LDraw library from the network.
