import { ImageResponse } from "next/og";
import { renderIcon } from "./_icons/glyph";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(renderIcon(size.width), { ...size });
}
