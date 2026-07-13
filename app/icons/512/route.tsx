import { ImageResponse } from "next/og";
import { renderIcon } from "../../_icons/glyph";

export async function GET() {
  return new ImageResponse(renderIcon(512), { width: 512, height: 512 });
}
