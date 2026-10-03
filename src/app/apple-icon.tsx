import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#0f0f0f",
          color: "#ffffff",
          fontSize: 62,
          fontWeight: 900,
          fontFamily: "Arial, sans-serif",
          position: "relative",
        }}
      >
        NT
        <div
          style={{
            position: "absolute",
            right: 28,
            top: 28,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: "#e23d2f",
            border: "5px solid #ffffff",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
