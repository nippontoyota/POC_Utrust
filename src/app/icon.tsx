import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
            width: 420,
            height: 240,
            border: `34px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 142,
            height: 270,
            border: `28px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 106,
            border: `28px solid ${stroke}`,
            borderRadius: 999,
            boxSizing: "border-box",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
