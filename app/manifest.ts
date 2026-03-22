import type { MetadataRoute } from "next";

/**
 * Installable / “Add to Home Screen” — `display: standalone` hides Safari’s browser chrome
 * when the app is opened from the home screen icon (after a fresh install).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TCG",
    short_name: "TCG",
    description: "Pokémon TCG",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait-primary",
  };
}
