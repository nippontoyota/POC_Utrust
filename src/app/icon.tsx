import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 128,
          color: "#ffffff",
          fontSize: 178,
          fontWeight: 900,
          fontFamily: "Arial, sans-serif",
          position: "relative",
        }}
      >
        NT
        <div
          style={{
            position: "absolute",
            right: 82,
            top: 82,
            width: 68,
            height: 68,
            borderRadius: 999,
            background: "#e23d2f",
            border: "14px solid #ffffff",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
