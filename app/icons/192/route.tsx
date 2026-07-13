import { ImageResponse } from "next/og";
import { renderIcon } from "../../_icons/glyph";

export async function GET() {
  return new ImageResponse(renderIcon(192), { width: 192, height: 192 });
}
