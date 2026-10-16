"use client";

import { PROTEINS } from "@/content/proteins";
import { useExplorerStore } from "@/store/explorerStore";

/**
 * The "viewfinder" frame from the reference: hairlines along the top and bottom, corner
 * brackets, the serif title sitting on the top line and a small note on the bottom line.
 */
export function FrameChrome() {
  const pdbId = useExplorerStore((s) => PROTEINS[s.selection.proteinId].pdbId);
  const corner = "absolute h-3 w-3 border-faint";
  return (
    <div className="pointer-events-none absolute inset-x-3 top-[26px] bottom-[26px] z-10 sm:inset-x-5 sm:top-[34px] sm:bottom-[30px]">
      {/* top and bottom hairlines */}
      <div className="absolute inset-x-0 top-0 h-px bg-line" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
      {/* corner brackets */}
      <span className={`${corner} -top-px -left-px border-t border-l`} />
      <span className={`${corner} -top-px -right-px border-t border-r`} />
      <span className={`${corner} -bottom-px -left-px border-b border-l`} />
      <span className={`${corner} -right-px -bottom-px border-r border-b`} />

      <div className="absolute inset-x-0 top-0 flex -translate-y-1/2 justify-center">
        <h1 className="bg-paper px-3 text-center font-display text-[16px] leading-tight font-extrabold tracking-[-0.015em] text-brand sm:px-5 sm:text-[22px]">
          Explore the Building Blocks of Life
        </h1>
      </div>
      <p className="absolute inset-x-0 top-[14px] hidden text-center text-[12.5px] text-muted min-[1200px]:block">
        Discover how proteins are built, from amino acids to atoms and beyond.
      </p>

      <div className="absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center">
        <p className="bg-paper px-3 text-center text-[10.5px] text-faint sm:text-[11px]">
          Models are simplified for learning, and each level notes what is simplified. Protein data: PDB {pdbId}.
        </p>
      </div>
    </div>
  );
}
