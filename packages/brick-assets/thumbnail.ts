import { execFileSync } from "node:child_process";

export const createPartThumbnailSvg = (width: number, depth: number, topStuds: boolean): string => {
  const scale = Math.min(116 / Math.max(width, depth), 24);
  const bodyWidth = width * scale;
  const bodyDepth = depth * scale;
  const x = (256 - bodyWidth) / 2;
  const y = (256 - bodyDepth) / 2 + 12;
  const studs = topStuds ? Array.from({ length: width * depth }, (_, index) => {
    const column = index % width;
    const row = Math.floor(index / width);
    const cx = x + (column + 0.5) * scale;
    const cy = y + (row + 0.5) * scale - 4;
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${Math.min(5, scale * 0.22).toFixed(2)}" fill="#e8f0ed" fill-opacity=".8"/>`;
  }).join("") : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="28" fill="#eef3f0"/><path d="M${x} ${y}l${bodyWidth} 0 18 12-18 12H${x}l-18-12Z" fill="#b8c6c2"/><rect x="${x}" y="${y + 12}" width="${bodyWidth}" height="${bodyDepth}" rx="6" fill="#8fa09d"/><path d="M${x} ${y + 12}h${bodyWidth}v${bodyDepth}H${x}z" fill="#9fafac"/><path d="M${x + bodyWidth} ${y + 12}l18-12v${bodyDepth}l-18 12z" fill="#6e7e7c"/>${studs}<text x="128" y="226" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#445352">${width}×${depth}</text></svg>`;
};

export const convertPpmToWebp = (ppm: Buffer): Buffer | undefined => {
  try {
    return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-vcodec", "ppm", "-i", "pipe:0", "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1", "-f", "webp", "pipe:1"], { input: ppm, maxBuffer: 1024 * 1024 });
  } catch {
    return undefined;
  }
};

export const createPartThumbnailPpm = (partWidth: number, partDepth: number, topStuds: boolean): Buffer => {
  const width = 256;
  const height = 256;
  const pixels = Buffer.alloc(width * height * 3, 0);
  const setPixel = (x: number, y: number, color: [number, number, number]): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = (y * width + x) * 3;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2];
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) setPixel(x, y, [238, 243, 240]);
  const scale = Math.min(148 / Math.max(partWidth, partDepth), 48);
  const bodyWidth = Math.max(24, Math.round(partWidth * scale));
  const bodyDepth = Math.max(24, Math.round(partDepth * scale));
  const bodyX = Math.round((width - bodyWidth) / 2);
  const bodyY = Math.round((height - bodyDepth) / 2) + 12;
  for (let y = bodyY; y < bodyY + bodyDepth; y += 1) for (let x = bodyX; x < bodyX + bodyWidth; x += 1) setPixel(x, y, [143, 160, 157]);
  for (let y = bodyY - 12; y < bodyY; y += 1) for (let x = bodyX; x < bodyX + bodyWidth; x += 1) setPixel(x, y, [184, 198, 194]);
  for (let y = bodyY; y < bodyY + bodyDepth; y += 1) for (let x = bodyX + bodyWidth; x < bodyX + bodyWidth + 18; x += 1) setPixel(x, y, [110, 126, 124]);
  if (topStuds) for (let row = 0; row < partDepth; row += 1) for (let column = 0; column < partWidth; column += 1) {
    const centerX = Math.round(bodyX + (column + 0.5) * scale);
    const centerY = Math.round(bodyY + (row + 0.5) * scale - 4);
    for (let y = centerY - 6; y <= centerY + 6; y += 1) for (let x = centerX - 6; x <= centerX + 6; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= 36) setPixel(x, y, [232, 240, 237]);
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]);
};
