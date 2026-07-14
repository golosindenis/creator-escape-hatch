import type { MetadataRoute } from "next";
import { APP_DESCRIPTION } from "@/lib/siteMeta";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AccountGuard",
    short_name: "AccountGuard",
    description: APP_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/mono", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
  };
}
