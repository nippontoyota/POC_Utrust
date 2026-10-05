import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const stroke = "#e23d2f";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 148,
            height: 84,
            border: `12px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 50,
            height: 94,
            border: `10px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 98,
            height: 38,
            border: `10px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
