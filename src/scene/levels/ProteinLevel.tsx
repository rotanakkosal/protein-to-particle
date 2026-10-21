"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, CylinderGeometry, InstancedMesh, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { buildRibbon, paintRibbon, type RibbonGeometry } from "@/lib/geometry/ribbon";
import type { Ligand, ProteinModel, Region } from "@/lib/structure/protein";
import { aaLabel } from "@/lib/structure/protein";
import { ELEMENTS } from "@/lib/chem/elements";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { regionHoverText } from "@/content/info";
import { hotspotsIn, LIGAND_INFO, PROTEINS } from "@/content/proteins";
import { setBaseOpacity, useStage } from "../StageGroup";
import { framingDistance, sceneRefs, transitionRuntime } from "../runtime";
import { getFraming } from "../framing";
import { HOTSPOT, sceneColors, SS_COLORS } from "../shared/palette";
import { SceneLabel } from "../shared/SceneLabel";
import { cylinderMatrix, placeBetween } from "../shared/geometry";

const ribbonCache = new WeakMap<ProteinModel, RibbonGeometry>();
/** The ribbon is shared by the protein view and the chain view's "ghost" outline. */
export function getRibbon(protein: ProteinModel): RibbonGeometry {
  let r = ribbonCache.get(protein);
  if (!r) {
    r = buildRibbon(protein);
    ribbonCache.set(protein, r);
  }
  return r;
}

const white = new Color("#ffffff");

export function residueBaseColors(protein: ProteinModel, scheme: "structure" | "rainbow"): Color[] {
  const n = protein.residues.length;
  return protein.residues.map((r, i) => {
    if (scheme === "rainbow") return new Color().setHSL(0.66 * (1 - i / (n - 1)), 0.62, 0.55);
    return new Color(SS_COLORS[r.ss]);
  });
}

export function ProteinLevel() {
  const { protein } = useProteinData();
  const { role } = useStage();
  const colorScheme = useExplorerStore((s) => s.colorScheme);
  const selectedRegion = useExplorerStore((s) => s.selection.regionId);
  const proteinId = useExplorerStore((s) => s.selection.proteinId);
  const showHotspots = useExplorerStore((s) => s.showHotspots);
  const theme = useExplorerStore((s) => s.theme);
  const ribbon = getRibbon(protein);
  const hotspots = useMemo(() => (showHotspots ? hotspotsIn(protein, proteinId) : []), [showHotspots, protein, proteinId]);

  const material = useMemo(
    () =>
      new MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.36,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.75,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const base = useMemo(() => {
    const colors = residueBaseColors(protein, colorScheme);
    for (const h of hotspots) colors[h.index].set(HOTSPOT);
    return colors;
  }, [protein, colorScheme, hotspots]);
  const display = useMemo(() => base.map((c) => c.clone()), [base]);
  const hoveredRegion = useRef<string | null>(null);
  const paintKey = useRef("");

  useFrame(() => {
    const dimming = role === "outgoing" && transitionRuntime.active ? transitionRuntime.approach : 0;
    const key = `${colorScheme}|${hotspots.length}|${hoveredRegion.current}|${dimming.toFixed(2)}|${selectedRegion}|${theme}`;
    if (key === paintKey.current) return;
    paintKey.current = key;
    protein.residues.forEach((r, i) => {
      const c = display[i].copy(base[i]);
      if (dimming > 0) {
        if (r.regionId === selectedRegion) c.lerp(white, 0.3 * dimming);
        else c.lerp(sceneColors.bg, 0.7 * dimming);
      } else if (hoveredRegion.current && r.regionId === hoveredRegion.current) {
        c.lerp(white, 0.38);
      } else if (hoveredRegion.current) {
        c.lerp(sceneColors.bg, 0.12);
      }
    });
    paintRibbon(ribbon, display);
  });

  const interactive = role === "current";
  const regionAt = (e: ThreeEvent<PointerEvent | MouseEvent>): { region: Region; residue: number } | null => {
    if (e.faceIndex == null) return null;
    const residue = ribbon.faceResidue[e.faceIndex];
    const region = protein.regionById[protein.residues[residue].regionId];
    return region ? { region, residue } : null;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    const hit = regionAt(e);
    if (!hit) return;
    hoveredRegion.current = hit.region.id;
    const mode = useExplorerStore.getState().mode;
    const spot = hotspots.find((h) => h.index === hit.residue);
    if (spot) {
      useExplorerStore.getState().setHover({
        key: `hotspot:${spot.label}`,
        title: `${aaLabel(protein.residues[spot.index])} · cancer hotspot ${spot.label}`,
        subtitle: mode === "beginner" ? spot.note.beginner : spot.note.scientific,
        hint: `Click to zoom into the chain near ${aaLabel(protein.residues[spot.index])}`,
        swatch: HOTSPOT,
      });
      document.body.style.cursor = "pointer";
      return;
    }
    const text = regionHoverText(hit.region, mode, useExplorerStore.getState().selection.proteinId);
    useExplorerStore.getState().setHover({
      key: `region:${hit.region.id}`,
      title: text.title,
      subtitle: text.subtitle,
      hint: `Click to zoom into the chain near ${aaLabel(protein.residues[hit.residue])}`,
      swatch: SS_COLORS[hit.region.kind === "helix" || hit.region.kind === "helix310" || hit.region.kind === "strand" ? hit.region.kind : "coil"],
    });
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    hoveredRegion.current = null;
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 5) return;
    e.stopPropagation();
    const hit = regionAt(e);
    if (!hit) return;
    hoveredRegion.current = null;
    document.body.style.cursor = "";
    useExplorerStore.getState().drillDown({ regionId: hit.region.id, residueIndex: hit.residue }, e.point.toArray());
  };

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  const scientific = useExplorerStore((s) => s.mode === "scientific");
  const siteLabels = useMemo(() => {
    return PROTEINS[proteinId].sites
      .map((site) => {
        const inSite = protein.residues.filter((r) => r.seq >= site.start && r.seq <= site.end);
        if (!inSite.length) return null;
        const c = inSite.reduce((acc, r) => acc.add(r.atoms.CA), new Vector3()).divideScalar(inSite.length);
        return { label: site.label, position: c.addScaledVector(c.clone().normalize(), 6).toArray() as [number, number, number] };
      })
      .filter((x): x is { label: string; position: [number, number, number] } => x !== null);
  }, [protein, proteinId]);

  const labels = useMemo(() => {
    const out = (v: Vector3, d = 7) => v.clone().addScaledVector(v.clone().normalize(), d).toArray();
    const strands = protein.regions.filter((r) => r.kind === "strand");
    const sheet = strands.reduce((acc, r) => acc.add(r.centroid), new Vector3()).divideScalar(Math.max(1, strands.length));
    const helices = protein.regions.filter((r) => r.kind === "helix");
    const helix = helices[0];
    const h310 = protein.regions.find((r) => r.kind === "helix310");
    const first = protein.residues[0];
    const last = protein.residues[protein.residues.length - 1];
    return {
      n: out(first.atoms.CA, 5),
      c: out(last.atoms.CA, 5),
      sheet: out(sheet, 12),
      helix: helix ? out(helix.centroid, 8) : null,
      // α1, α2, ... (the conventional names, numbered N → C) for Scientific mode
      helices: helices.map((r) => ({ id: r.id, name: `α${r.ordinal}`, position: out(r.centroid, 8) })),
      h310: h310 ? out(h310.centroid, 6) : null,
      nLabel: aaLabel(first),
      cLabel: aaLabel(last),
    };
  }, [protein]);

  return (
    <group>
      <mesh geometry={ribbon.geometry} material={material} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      <SideChainDetail protein={protein} />
      {protein.ligands.map((l) => (
        <LigandModel key={l.key} ligand={l} interactive={interactive} />
      ))}
      {hotspots.length > 0 && <HotspotMarkers protein={protein} hotspots={hotspots} />}
      {siteLabels.map((site) => (
        <SceneLabel key={site.label} position={site.position} tone="gold">
          {site.label}
        </SceneLabel>
      ))}
      <SceneLabel position={labels.n} tone="muted">N-terminus · {labels.nLabel}</SceneLabel>
      <SceneLabel position={labels.c} tone="muted">C-terminus · {labels.cLabel}</SceneLabel>
      <SceneLabel position={labels.sheet}>β-sheet</SceneLabel>
      {scientific && labels.helices.length > 1
        ? labels.helices.map((h) => (
            <SceneLabel key={h.id} position={h.position}>
              {h.name}
            </SceneLabel>
          ))
        : labels.helix && <SceneLabel position={labels.helix}>α-helix</SceneLabel>}
      {labels.h310 && <SceneLabel position={labels.h310} tone="muted">3₁₀-helix</SceneLabel>}
    </group>
  );
}

/** Side-chain sticks that fade in as the user zooms close to the ribbon. */
function SideChainDetail({ protein }: { protein: ProteinModel }) {
  const ref = useRef<InstancedMesh>(null);
  const count = protein.sideChainBonds.length * 2;
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 8, 1, true), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.45, transparent: true, opacity: 0, depthWrite: true }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const mid = new Vector3();
    const color = new Color();
    protein.sideChainBonds.forEach((b, i) => {
      mid.addVectors(b.a, b.b).multiplyScalar(0.5);
      mesh.setMatrixAt(i * 2, cylinderMatrix(b.a, mid, 0.17, m));
      mesh.setColorAt(i * 2, color.set(ELEMENTS[b.ea].color));
      mesh.setMatrixAt(i * 2 + 1, cylinderMatrix(mid, b.b, 0.17, m));
      mesh.setColorAt(i * 2 + 1, color.set(ELEMENTS[b.eb].color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [protein]);

  useFrame(() => {
    const mesh = ref.current;
    const c = sceneRefs.controls;
    if (!mesh || !c) return;
    const settled = framingDistance(getFraming(0).radius);
    const t = Math.min(1, Math.max(0, (settled * 0.78 - c.distance) / (settled * 0.3)));
    setBaseOpacity(material, t * 0.95);
    mesh.visible = t > 0.01;
  });

  return <instancedMesh ref={ref} args={[geometry, material, count]} raycast={() => null} />;
}

/** Red beads on the Cα of each hotspot, labelled by mutation name (adjacent ones share a label). */
function HotspotMarkers({ protein, hotspots }: { protein: ProteinModel; hotspots: ReturnType<typeof hotspotsIn> }) {
  const res = useMemo(
    () => ({
      sphere: new SphereGeometry(1, 24, 16),
      mat: new MeshPhysicalMaterial({ color: HOTSPOT, emissive: HOTSPOT, emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 0.8 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      res.sphere.dispose();
      res.mat.dispose();
    },
    [res],
  );
  const groups = useMemo(() => {
    const out: { text: string; position: [number, number, number] }[] = [];
    let run: typeof hotspots = [];
    const flush = () => {
      if (!run.length) return;
      const c = run.reduce((acc, h) => acc.add(protein.residues[h.index].atoms.CA), new Vector3()).divideScalar(run.length);
      out.push({ text: run.map((h) => h.label).join(" · "), position: c.addScaledVector(c.clone().normalize(), 5.5).toArray() as [number, number, number] });
      run = [];
    };
    for (const h of [...hotspots].sort((a, b) => a.index - b.index)) {
      if (run.length && h.index !== run[run.length - 1].index + 1) flush();
      run.push(h);
    }
    flush();
    return out;
  }, [protein, hotspots]);

  return (
    <group>
      {hotspots.map((h) => (
        <mesh key={h.label} geometry={res.sphere} material={res.mat} position={protein.residues[h.index].atoms.CA} scale={1.05} raycast={() => null} />
      ))}
      {groups.map((g) => (
        <SceneLabel key={g.text} position={g.position} tone="hotspot" essential>
          {g.text}
        </SceneLabel>
      ))}
    </group>
  );
}

const LIGAND_COLORS: Record<string, string> = { C: "#5E6168", N: "#3D5FD9", O: "#E0413A", P: "#E8862A", S: "#E2B93B", MG: "#4FAF5C" };

/** A bound ligand or ion (e.g. GDP, Mg²⁺) as a small ball-and-stick model sitting in its pocket. */
function LigandModel({ ligand, interactive }: { ligand: Ligand; interactive: boolean }) {
  const res = useMemo(() => {
    const sphere = new SphereGeometry(1, 20, 14);
    const stick = new CylinderGeometry(1, 1, 1, 10, 1, true);
    const mats: Record<string, MeshPhysicalMaterial> = {};
    for (const a of ligand.atoms) {
      if (!mats[a.element]) mats[a.element] = new MeshPhysicalMaterial({ color: LIGAND_COLORS[a.element] ?? "#9AA3B2", roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    }
    const bondMat = new MeshStandardMaterial({ color: "#8E97A8", roughness: 0.5 });
    return { sphere, stick, mats, bondMat };
  }, [ligand]);
  useEffect(
    () => () => {
      res.sphere.dispose();
      res.stick.dispose();
      res.bondMat.dispose();
      Object.values(res.mats).forEach((m) => m.dispose());
    },
    [res],
  );

  const info = LIGAND_INFO[ligand.resName];
  const ion = ligand.atoms.length === 1;
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    const mode = useExplorerStore.getState().mode;
    useExplorerStore.getState().setHover({
      key: `ligand:${ligand.key}`,
      title: `${info?.name ?? ligand.resName} · bound ${ion ? "ion" : "molecule"}`,
      subtitle: info ? (mode === "beginner" ? info.beginner : info.scientific) : `Ligand ${ligand.resName} ${ligand.resSeq}`,
    });
  };
  const onOut = () => {
    const st = useExplorerStore.getState();
    if (st.hover?.key === `ligand:${ligand.key}`) st.setHover(null);
  };

  return (
    <group>
      {ligand.atoms.map((a, i) => (
        <mesh
          key={i}
          geometry={res.sphere}
          material={res.mats[a.element]}
          position={a.position}
          scale={ion ? 0.75 : a.element === "P" ? 0.5 : 0.42}
          onPointerOver={onOver}
          onPointerOut={onOut}
        />
      ))}
      {ligand.bonds.map(([i, j]) => (
        <mesh
          key={`${i}-${j}`}
          geometry={res.stick}
          material={res.bondMat}
          raycast={() => null}
          ref={(m) => {
            if (m) placeBetween(m, ligand.atoms[i].position, ligand.atoms[j].position, 0.15);
          }}
        />
      ))}
      <SceneLabel position={ligand.centroid.clone().add(new Vector3(0, ion ? 1.4 : 3.2, 0)).toArray() as [number, number, number]} tone="strong">
        {info?.name ?? ligand.resName}
      </SceneLabel>
    </group>
  );
}
