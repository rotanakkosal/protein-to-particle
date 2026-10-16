# Explore the Building Blocks of Life

An interactive 3D journey into a real protein. Start with the folded protein **ubiquitin** (PDB 1UBI) or the cancer protein **KRAS** (PDB 4OBE) and zoom continuously through five levels of structure:

**Protein → Polypeptide Chain → Amino Acid → Atom → Subatomic Particles**

Click any part to fly into it. The camera approaches the component you picked, the surrounding structure swells past the camera and dissolves, and the next level grows out of the exact spot you clicked. Every level is real, interactive 3D (Three.js / React Three Fiber), built from measured coordinates wherever they exist. Each level states clearly what has been simplified.

![Level I: ubiquitin ribbon](docs/screenshots/1-protein.jpg)

| II · Polypeptide chain | III · Amino acid (Gly10) | IV · Carbon-12 atom | V · Subatomic particles |
| --- | --- | --- | --- |
| ![chain](docs/screenshots/2-polypeptide-chain.jpg) | ![amino acid](docs/screenshots/3-amino-acid.jpg) | ![atom](docs/screenshots/4-atom.jpg) | ![particles](docs/screenshots/5-subatomic-particles.jpg) |
| ![unfolded](docs/screenshots/2b-chain-unfolded.jpg) | ![free amino acid](docs/screenshots/3b-free-amino-acid.jpg) | ![electron cloud](docs/screenshots/4b-electron-cloud.jpg) | ![zoom transition](docs/screenshots/transition-zoom.jpg) |

---

## Proteins

Use the **Protein** switcher (top centre) to choose a structure. Each one starts on a showcase glycine.

| Protein | PDB entry | Starts at | Notes |
| --- | --- | --- | --- |
| Ubiquitin | 1UBI (X-ray, 1.8 Å), bundled in `public/pdb/1UBI.pdb` | Gly10 | The "recycle me" tag; Lys48 chain-link site labelled |
| KRAS | 4OBE (X-ray, 1.24 Å; KRAS G-domain, residues 1–169, with GDP and Mg²⁺), bundled in `public/pdb/4OBE.cif` | Gly12, the commonest cancer hotspot | P-loop, switch I and switch II labelled; GDP and Mg²⁺ drawn as ball-and-stick |

![KRAS with GDP and Mg²⁺](docs/screenshots/kras-protein.jpg)

Structures can be in either the classic PDB format (`.pdb`) or PDBx/mmCIF (`.cif`, the wwPDB's current standard format); the app detects the format from the file contents. It loads the bundled copy first and, if that file is missing, downloads it from `files.rcsb.org` in the browser. To add another protein, drop its structure file into `public/pdb/` and add an entry to `src/content/proteins.ts` (file, chain, start residue, functional sites, residue notes and Level I text).

## Quick start

Requirements: **Node.js ≥ 20.9** and npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start            # http://localhost:3000
```

Other scripts: `npm run lint`, `npm run typecheck`.

No API keys or network access are needed at runtime. Both protein structures ship with the app (`public/pdb/`), and fonts and lighting are bundled locally.

---

## What you can do

| Level | What you see | Interact |
| --- | --- | --- |
| **I · Protein** | Ubiquitin as a cartoon ribbon computed from the crystal structure: α-helix, 3₁₀-helix, five β-strands (arrows), loops. Zoom close and the side-chain bonds fade in. | Hover a helix, strand or loop to highlight it. Click to zoom into the chain at that spot. Colour by structure or by chain order (N→C rainbow). |
| **II · Polypeptide chain** | One bead per amino acid at its real Cα position, coloured by side-chain type. Gold bands sit at the real C–N peptide-bond positions, with a faint outline of the folded ribbon behind. | Hover or click beads, or tap letters in the sequence strip. **Unfold chain** straightens all 76 residues into a serpentine N→C line, then folds them back. |
| **III · Amino acid** | Ball-and-stick model of the selected residue (Gly10 by default) from the crystal structure, with hydrogens added. Neighbouring residues are ghosted and both peptide bonds highlighted. | Hover any atom for its name, element and bonds. Click an atom to zoom into it. Toggle **In the protein ↔ Free amino acid**; the atoms released as water when a peptide bond forms get a blue halo. |
| **IV · Atom** | The atom you clicked: carbon-12 (6 p⁺, 6 n⁰, 6 e⁻), or H, N, O, S with their correct counts. Stubs point along its real bonds back in the amino acid. | Click a proton, neutron or electron. Toggle **Orbit model (simplified) ↔ Electron cloud** (orbital probability densities). |
| **V · Subatomic particles** | Proton (uud), neutron (udd) and electron side by side, with quarks, gluon "springs", electric-field arrows (out of +, into −) and brackets showing which particles live in the nucleus. | Select a particle to compare charge and mass. Toggle quarks and the charge field. |

**Learning modes:** *Beginner* uses short, everyday explanations. *Scientific* adds terminology, formulas, φ/ψ torsion angles and bond lengths measured from the coordinates, isotope data and particle constants. The info card has *Made of / Example / Why it matters* tabs, shows how each level relates to the levels above and below, and ends with a note on what is simplified.

### Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Rotate | drag | Space toggles auto-rotate |
| Zoom | wheel / pinch, or the `+` `−` buttons | `+` / `−` |
| Pan | right-drag / two-finger drag | |
| Zoom into a component | click it | `→` (zooms into the current selection) |
| Previous level | "Back to …" button | `←` or `Esc` |
| Jump to any level | right-hand I–V navigation or the breadcrumb | |
| Reset view / start over | **Reset** / **Start over** | `R` |
| Labels | **Labels** | `L` |
| Beginner ↔ Scientific | toggle | `M` |

The magnification and scale bar in the top-left pill update live as you zoom (Levels I–III use real Å/nm scale; IV–V are marked schematic).

---

## Scientific notes and simplifications

* **Data.** PDB entry **1UBI**: human ubiquitin, X-ray diffraction at 1.8 Å (Ramage *et al.*, *Biochem. J.* 299:151, 1994). PDB entry **4OBE**: GDP-bound human KRAS, chain A, X-ray diffraction at 1.24 Å (Hunter *et al.*, *PNAS* 111:8895, 2014); its expression-tag Gly0 is unobserved, so the model runs Met1–Lys169. PDB data is CC0 / public domain. Secondary structure comes from the entry's own HELIX/SHEET records. The structure is centred and rotated onto its principal axes using a proper rotation (det = +1), so the chirality of the L-amino acids is preserved.
* **Ribbon.** A centripetal Catmull–Rom spline runs through the Cα atoms. Ribbon orientation follows the C=O vectors, so helices coil and β-sheets lie flat. Arrows point N→C.
* **Bead model (II).** One bead stands for a whole residue. This simplification is stated on screen.
* **Amino acid (III).** Heavy atoms are the crystal coordinates. X-ray structures rarely resolve hydrogens, so they are placed from residue templates (4OBE includes riding hydrogens added during refinement; these are skipped so both proteins are drawn the same way) with ideal geometry (C–H 1.09 Å, N–H 1.01 Å, O–H 0.96 Å; sp³ tetrahedral, sp² trigonal). Protonation states are for pH ≈ 7: Lys/Arg protonated, Asp/Glu deprotonated, His as the Nε2–H tautomer, a charged N-terminus and C-terminus. The free amino acid uses the neutral textbook form; the scientific text notes the zwitterion. Formulas are counted from the displayed atoms and verified against reference formulas for every residue type in ubiquitin.
* **Atom (IV).** The Bohr-style orbits carry an on-screen warning that electrons do not travel in fixed planetary orbits. The cloud view samples Slater-type 1s/2s/2p densities (Clementi–Raimondi exponents; radial nodes omitted) and fills p orbitals by Hund's rule. The nucleus is enlarged about 10⁴×; the text states the real scale ("a 1 cm marble → an atom about 280 m across").
* **Particles (V).** Charges, masses, quark content and lifetimes are standard values. Sizes and colours are schematic, and the gluon springs are only a suggestion of the strong force.

---

## Project structure

```
public/pdb/                      Real coordinates loaded at runtime: 1UBI.pdb, 4OBE.cif
src/
  app/                           Next.js App Router: layout, page, global styles, icon
  components/
    ExplorerShell.tsx            Static frame + client-only dynamic import of the explorer
    Explorer.tsx                 Overlay layout (desktop side panel / mobile bottom sheet)
    useKeyboardShortcuts.ts
    ui/                          FrameChrome, ScalePill, Breadcrumb, ViewControls, LevelNav,
                                 InfoPanel + LevelWidgets, BottomBar, HoverTooltip, Hints,
                                 LabelOverlay, LoadingState, ProteinSwitcher
  content/                       Educational content (separate from rendering)
    proteins.ts                  The proteins on offer: file, start residue, sites, Level I text
    info.ts                      Beginner/scientific text per level, hover text, breadcrumb
    aminoAcids.ts                Reference data for all 20 amino acids
    levels.ts                    Level names, numerals, real-world scale per unit
  lib/                           Pure scientific/geometry code (no React)
    pdb/parsePdb.ts              Fixed-column PDB parser (ATOM, HETATM, HELIX, SHEET)
    pdb/parseCif.ts              PDBx/mmCIF reader (atom_site, struct_conf, struct_sheet_range)
    structure/protein.ts         Protein model: centring, principal axes, regions, loading
    structure/chainLayout.ts     Folded / unfolded bead layouts
    geometry/ribbon.ts           Cartoon ribbon mesh builder (+ per-residue picking)
    chem/elements.ts             H, C, N, O, S: CPK colours, isotopes, shells, orbitals
    chem/residueTemplates.ts     Bonds, bond orders, hydrogen specs for 20 residues
    chem/geometry.ts             Ideal hydrogen placement, ideal Cβ
    chem/residueMolecule.ts      Level III model (residue + free forms, neighbours, formulas)
    atom/atomModel.ts            Nucleon packing, Bohr shells, orbital cloud sampling
  scene/                         3D rendering (React Three Fiber)
    SceneCanvas.tsx              Canvas, lights, adaptive DPR, fog
    StageManager.tsx             Mounts current / outgoing / incoming level stages
    StageGroup.tsx               Per-stage transform + material fade during transitions
    TransitionController.tsx     Staged zoom: approach → dissolve → settle (both directions)
    CameraRig.tsx                CameraControls, panel-aware view offset, zoom/reset, scale bar
    framing.ts                   Per-level camera framing and zoom anchors
    runtime.ts                   Mutable per-frame state shared outside React
    levels/                      ProteinLevel, PolypeptideLevel, AminoAcidLevel, AtomLevel,
                                 ParticleLevel, atomLayout
    shared/                      Palette, SceneLabel + label registry, geometry helpers
  store/
    explorerStore.ts             Zustand: level, selection path, modes, toggles, transitions
    dataStore.ts                 Loaded proteins + memoised per-residue molecules
```

### How a transition works

1. A click calls `drillDown(selection, clickedPoint)` in the store, which records a `TransitionRequest` (from, to, anchor).
2. `StageManager` mounts the incoming level alongside the outgoing one.
3. `TransitionController` runs every frame, outside React:
   * **approach**: the camera eases toward the anchor while the rest of the outgoing level dims;
   * **dissolve**: the outgoing level scales up around the anchor and fades, the incoming level grows from the anchor, and a soft backdrop blur peaks;
   * **settle**: the camera frames the new level.
4. Zooming out runs in reverse: the child shrinks back into its place and the parent condenses from a close-up. When you go back up, the camera restores the view you last had at that level.
5. Protein ↔ chain share coordinates, so that step is an in-place morph: the ribbon fades as beads ripple outward from where you clicked.

---

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Three.js · @react-three/fiber · @react-three/drei · Tailwind CSS v4 · Motion · Zustand · lucide-react · Fontsource (Plus Jakarta Sans).

**Visual style:** a navy-on-white identity (primary `#07265A`) with grey-blue panels, navy section bars and a single geometric sans (Plus Jakarta Sans) for headings and text. All colours are Tailwind theme tokens in `src/app/globals.css` (`brand`, `brand-mid`, `brand-soft`, `paper`, `panel`, `ink`, `body`, `muted`, `line`); the 3D scene palette lives in `src/scene/shared/palette.ts` and its background matches `--color-paper` so the depth fog blends in.

* `three` is pinned to **0.182.0**. React Three Fiber 9.x still creates a `THREE.Clock`, which three r183+ deprecates with a console warning; 0.182 keeps the console clean.
* 3D labels use a small custom overlay (`LabelOverlay`) instead of drei's `<Html>`. Each `<Html>` creates its own React root, and unmounting many of them in one commit (which every level transition does) can race in React 19.
* WebGL resources created imperatively are disposed on unmount. Rendering adapts its pixel ratio to device performance.

### Debugging

Append `?debug` to the URL to expose `window.__explorer`, which holds the stores, scene refs and a `transitionRuntime.timeScale` you can lower to watch transitions frame by frame.
