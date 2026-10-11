"use client";

import React from "react";

/** Marks the page's own sticky header; group headers pin right below it. */
export const STICKY_HEADER_ATTR = "data-pr-sticky-header";

/**
 * Height of the sticky PR header (title + tabs) inside the same scroll container.
 * Group headers use it as their `top`, otherwise they slide under that header.
 */
export function useStickyOffset(): number {
  const [top, setTop] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(`[${STICKY_HEADER_ATTR}]`);
    if (!el) return;
    const update = () => setTop(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return top;
}
