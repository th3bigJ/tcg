"use client";

import { useEffect, useRef, useState } from "react";
import { CHROME_SCROLL_EVENT } from "@/lib/chromeVisibility";

export function useAutoHideChrome({
  disabled = false,
  topRevealThreshold = 24,
  hideAfter = 80,
  minDelta = 12,
}: {
  disabled?: boolean;
  topRevealThreshold?: number;
  hideAfter?: number;
  minDelta?: number;
} = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const [forceVisible, setForceVisible] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frameId: number | null = null;

    if (disabled) {
      lastScrollYRef.current = window.scrollY;
      frameId = window.requestAnimationFrame(() => setForceVisible(true));
      return () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
      };
    }

    lastScrollYRef.current = window.scrollY;
    if (forceVisible) {
      frameId = window.requestAnimationFrame(() => setForceVisible(false));
    }

    const updateVisibility = (currentScrollY: number) => {
      const delta = currentScrollY - lastScrollYRef.current;

      if (currentScrollY <= topRevealThreshold) {
        setIsVisible(true);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      if (Math.abs(delta) < minDelta) return;

      if (delta > 0 && currentScrollY > hideAfter) {
        setIsVisible(false);
      } else if (delta < 0) {
        setIsVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    const handleWindowScroll = () => {
      updateVisibility(window.scrollY);
    };

    const handleChromeScroll = (event: Event) => {
      const customEvent = event as CustomEvent<{ scrollY?: number }>;
      const scrollY = customEvent.detail?.scrollY;
      if (typeof scrollY !== "number") return;
      updateVisibility(scrollY);
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener(CHROME_SCROLL_EVENT, handleChromeScroll as EventListener);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleWindowScroll);
      window.removeEventListener(CHROME_SCROLL_EVENT, handleChromeScroll as EventListener);
    };
  }, [disabled, forceVisible, hideAfter, minDelta, topRevealThreshold]);

  return disabled || forceVisible || isVisible;
}
