"use client";

import type { ComponentType } from "react";
import type { StageKey } from "@/store/pipelineStore";
import type { StageFraming } from "../runtime";
import { GeneStage, geneFraming } from "./GeneStage";
import { ConstructStage, constructFraming } from "./ConstructStage";
import { PlasmidStage, plasmidFraming } from "./PlasmidStage";
import { CellStage, cellFraming } from "./CellStage";
import { ExpressionStage, expressionFraming } from "./ExpressionStage";
import { PurificationStage, purificationFraming } from "./PurificationStage";
import { StorageStage, storageFraming } from "./StorageStage";
import { CrystalStage, crystalFraming } from "./CrystalStage";
import { DiffractionStage, diffractionFraming } from "./DiffractionStage";
import { StructureStage, structureFraming } from "./StructureStage";

export interface StageDef {
  Component: ComponentType;
  /** Camera framing once the stage has settled (may read the stage's own view toggles) */
  framing: () => StageFraming;
  /** Gentle auto-rotation suits free-floating objects, not lab set-ups seen from the front */
  autoRotate?: boolean;
}

export const STAGES: Record<StageKey, StageDef> = {
  gene: { Component: GeneStage, framing: geneFraming, autoRotate: false },
  construct: { Component: ConstructStage, framing: constructFraming, autoRotate: false },
  plasmid: { Component: PlasmidStage, framing: plasmidFraming, autoRotate: false },
  cell: { Component: CellStage, framing: cellFraming },
  expression: { Component: ExpressionStage, framing: expressionFraming, autoRotate: false },
  purification: { Component: PurificationStage, framing: purificationFraming, autoRotate: false },
  storage: { Component: StorageStage, framing: storageFraming, autoRotate: false },
  crystal: { Component: CrystalStage, framing: crystalFraming, autoRotate: false },
  diffraction: { Component: DiffractionStage, framing: diffractionFraming, autoRotate: false },
  structure: { Component: StructureStage, framing: structureFraming, autoRotate: false },
};
