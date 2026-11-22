/**
 * Verkleinert ein Foto im Browser, bevor es zum Server geht.
 *
 * Ein Handyfoto hat mehrere Megabyte. Für eine Buchseite reichen 1600 Pixel
 * an der langen Kante gut aus. Das Neukodieren entfernt nebenbei alle
 * EXIF-Daten, also auch den Aufnahmeort.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkPhoto(file: Blob): Promise<Blob> {
  // Ohne "from-image" liegen Fotos vom Handy quer. Die Drehung steht nur in den EXIF-Daten.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const factor = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Das Bild konnte nicht verarbeitet werden.");
    // Weisser Grund, damit durchsichtige Bilder als JPEG nicht schwarz werden.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht verarbeitet werden."))),
        "image/jpeg",
        QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
