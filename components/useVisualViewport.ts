"use client";
import { useEffect, useState } from "react";

/** Fit overlays above a phone keyboard and follow browser zoom/pan without polling. */
export function useVisualViewport(active: boolean) {
  const [viewport, setViewport] = useState<{
    top: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    if (!active) return;
    const view = window.visualViewport;
    const measure = () => {
      const top = view?.offsetTop || 0,
        height = view?.height || window.innerHeight;
      setViewport((current) =>
        current?.top === top && current.height === height
          ? current
          : { top, height },
      );
    };
    measure();
    view?.addEventListener("resize", measure);
    view?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      view?.removeEventListener("resize", measure);
      view?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active]);
  return viewport;
}
