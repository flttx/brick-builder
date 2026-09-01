export interface ThumbnailStorage {
  put(projectId: string, content: Uint8Array, contentType: "image/webp"): Promise<string>;
  getUrl(projectId: string): Promise<string | null>;
}

export const createWebpThumbnail = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = 512;
  thumbnail.height = 384;
  const context = thumbnail.getContext("2d");
  if (context === null) { reject(new Error("Thumbnail canvas is unavailable")); return; }
  const scale = Math.max(512 / canvas.width, 384 / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  context.drawImage(canvas, (512 - width) / 2, (384 - height) / 2, width, height);
  thumbnail.toBlob((blob) => blob === null ? reject(new Error("Thumbnail encoding failed")) : resolve(blob), "image/webp", 0.82);
});

