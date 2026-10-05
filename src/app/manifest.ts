import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UTrust POC - Nippon Toyota Pre-Owned Cars",
    short_name: "UTrust",
    description: "Used-vehicle purchase workflow for Nippon Toyota's UTrust Pre-Owned Cars team",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#18181b",
    icons: [
      { src: "/logo.png", sizes: "632x395", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "632x395", type: "image/png", purpose: "maskable" },
    ],
  };
}
