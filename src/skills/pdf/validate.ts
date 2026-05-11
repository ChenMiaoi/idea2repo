export function isPdf(buffer: Buffer | Uint8Array): boolean {
  if (buffer.byteLength < 5) return false;
  const header = Buffer.from(buffer).subarray(0, 5).toString("ascii");
  return header === "%PDF-";
}

export function assertPdf(buffer: Buffer | Uint8Array): void {
  if (!isPdf(buffer)) throw new Error("downloaded file is not a PDF");
}
