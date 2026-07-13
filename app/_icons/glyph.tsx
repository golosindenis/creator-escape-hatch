import type { ReactElement } from "react";

export function renderIcon(size: number): ReactElement {
  const shieldSize = Math.round(size * 0.72);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0c0e",
      }}
    >
      <svg width={shieldSize} height={shieldSize} viewBox="0 0 100 100" fill="none">
        <path
          d="M50 6 L90 22 V48 C90 74 72 92 50 98 C28 92 10 74 10 48 V22 Z"
          fill="#2dd4bf"
        />
        <path
          d="M32 50 L45 63 L70 34"
          stroke="#0b0c0e"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
