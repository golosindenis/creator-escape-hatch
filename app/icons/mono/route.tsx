import { ImageResponse } from "next/og";
import { renderMonochromeIcon } from "../../_icons/glyph";

export async function GET() {
  return new ImageResponse(renderMonochromeIcon(512), { width: 512, height: 512 });
}
