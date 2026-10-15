import type { MetadataRoute } from "next";

// Minimal web app manifest for installability (Android Chrome "Install app",
// iOS via appleWebApp metadata in layout.tsx). Uses the existing SVG favicon;
// proper 192/512 PNG + maskable icons can be added later for richer prompts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACUMEN",
    short_name: "ACUMEN",
    description: "Voice-first lightweight CRM",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}