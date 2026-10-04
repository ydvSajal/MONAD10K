import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: same mark as icon.svg, full-bleed (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #232323, #050505)",
        }}
      >
        <svg width="88" height="136" viewBox="0 0 31.5 48.5">
          <defs>
            <linearGradient id="m" x1="8" y1="0" x2="34.1" y2="28.9" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#d9d9d9" />
              <stop offset=".34" stopColor="#bfbfbf" />
              <stop offset=".4" stopColor="#5c5c5c" />
              <stop offset=".55" stopColor="#666" />
              <stop offset=".62" stopColor="#a8a8a8" />
              <stop offset=".8" stopColor="#d4d4d4" />
              <stop offset="1" stopColor="#fff" />
            </linearGradient>
          </defs>
          <path d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z" fill="url(#m)" />
          <rect x="0.5" y="18.5" width="9" height="10" fill="#fff" />
          <rect x="22" y="19.5" width="9.5" height="9.5" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
