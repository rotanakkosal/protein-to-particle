"use client";

import { useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 767px)";

/** True on phone-sized screens (the layout switches to a bottom sheet). */
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(mobileQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
}
