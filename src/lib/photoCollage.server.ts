import "server-only";
import sharp from "sharp";

export type CollageImageInput = {
  buffer: Buffer;
  category?: string;
};

/**
 * Stitches 1 to 4 vehicle inspection photos into a single high-resolution composite image.
 * This solves Meta WhatsApp's strict restriction of allowing only 1 media attachment per template,
 * guaranteeing all key inspection angles (Front, Rear, Side, Odometer/Interior) are delivered to brokers.
 */
export async function createVehiclePhotoCollage(images: CollageImageInput[]): Promise<Buffer> {
  if (images.length === 0) {
    throw new Error("No images provided for collage");
  }

  // Single photo: optimize and return directly as JPEG
  if (images.length === 1) {
    return sharp(images[0].buffer)
      .rotate()
      .resize(1200, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  const totalW = 1200;
  const gutter = 8;

  // 2 Photos: Side-by-side split
  if (images.length === 2) {
    const totalH = 600;
    const tileW = Math.floor((totalW - gutter) / 2);
    const tileH = totalH;

    const [r1, r2] = await Promise.all([
      sharp(images[0].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
      sharp(images[1].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
    ]);

    return sharp({
      create: {
        width: totalW,
        height: totalH,
        channels: 3,
        background: { r: 240, g: 240, b: 242 },
      },
    })
      .composite([
        { input: r1, top: 0, left: 0 },
        { input: r2, top: 0, left: tileW + gutter },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  // 3 Photos: 2 on top row, 1 full-width on bottom row
  if (images.length === 3) {
    const totalH = 800;
    const tileH = Math.floor((totalH - gutter) / 2);
    const tileW = Math.floor((totalW - gutter) / 2);

    const [r1, r2, r3] = await Promise.all([
      sharp(images[0].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
      sharp(images[1].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
      sharp(images[2].buffer).rotate().resize(totalW, tileH, { fit: "cover" }).toBuffer(),
    ]);

    return sharp({
      create: {
        width: totalW,
        height: totalH,
        channels: 3,
        background: { r: 240, g: 240, b: 242 },
      },
    })
      .composite([
        { input: r1, top: 0, left: 0 },
        { input: r2, top: 0, left: tileW + gutter },
        { input: r3, top: tileH + gutter, left: 0 },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  // 4 or more Photos: 2x2 Clean Grid
  const totalH = 800;
  const tileW = Math.floor((totalW - gutter) / 2);
  const tileH = Math.floor((totalH - gutter) / 2);

  const [r1, r2, r3, r4] = await Promise.all([
    sharp(images[0].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
    sharp(images[1].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
    sharp(images[2].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
    sharp(images[3].buffer).rotate().resize(tileW, tileH, { fit: "cover" }).toBuffer(),
  ]);

  return sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 3,
      background: { r: 240, g: 240, b: 242 },
    },
  })
    .composite([
      { input: r1, top: 0, left: 0 },
      { input: r2, top: 0, left: tileW + gutter },
      { input: r3, top: tileH + gutter, left: 0 },
      { input: r4, top: tileH + gutter, left: tileW + gutter },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}
