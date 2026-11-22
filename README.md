# MonitorForge

Plan a monitor stand / desk organiser built from **broom handles** and **3D-printed parts**,
then export every printed part as STL plus a cut list and assembly PDF.

## Try it

**https://zxvato.github.io/MonitorForge/** — runs in the browser, nothing to install.
It redeploys automatically on every push to `main`.

Before printing a whole set, open *Parts & export* and print the **fit test** (five short sockets
with different clearances). Click the number of the one that fits your handle best.

## Run it locally

```bash
npm install
npm run dev        # open the printed URL
```

`npm run build` makes a static site in `dist/` that you can host anywhere.

## How it works

- **Posts** are upright handles standing on printed feet. **Beams** are horizontal handles
  between posts that line up along X or Y. A beam that passes another post is split there.
- **Connectors are chosen automatically** from how handles meet at each point (foot, end cap,
  elbow, tee, corner, cross…). Identical shapes are merged into one STL with a quantity.
  Sleeves are rounded squares and side holes are flat-topped teardrops, so connectors print
  without supports in the exported orientation.
- **Add-ons**
  - *Monitor shelf*: sits on two parallel beams with grooves and ribs underneath, notched
    around connector sleeves, and split into pinned tiles if it is bigger than the bed.
  - *Drawer*: two hangers snap up onto two parallel beams; the box slides on tongues.
  - *Divider*: a panel between two posts, held by snap clips.
  - *Apple Watch stand*: snaps onto a post, with a tilted cradle for the charging puck and a cable slot.
- **Settings**: handle diameter (default 22 mm), socket clearance, clip grip, socket depth,
  wall thickness, printer bed size, stock handle length and saw kerf.

Drag items from the left panel into the 3D view (or select a post/beam and click them).
Drag posts to move them (Shift moves the whole frame), drag beams up and down, and slide add-ons along.
Delete, Ctrl+Z / Ctrl+Shift+Z and Ctrl+D work as expected.

## Export (Parts & export tab)

`Download all parts (.zip)` contains:

- `parts/<group>/<name>_x<qty>.stl`: print-oriented, on z = 0
- `cut-list.csv`
- `assembly.pdf`: overview with a snapshot, shopping list, cutting plan, post-by-post assembly, parts table
- `design.json`: re-open it with **Open**

Tip: print one connector first and test the fit on your handle, then adjust *socket clearance*.

## Code map

| Path | What |
| --- | --- |
| `src/model/` | design types, store (undo/redo, autosave), topology (nodes, rods, cut lengths), templates |
| `src/geometry/` | Manifold (WASM CSG) part generators: `connector.ts`, `addons/*`, `parts.ts` (design → part instances) |
| `src/export/` | BOM and stock cutting plan, STL, PDF, ZIP |
| `src/ui/` | React + react-three-fiber UI |

## Tests

```bash
npm test                     # topology, geometry validity, collisions, BOM, PDF
npm run build && npm run e2e # browser test: drag & drop, export ZIP, check every STL fits the bed
```
