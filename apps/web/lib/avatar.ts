/**
 * Turn a chosen image file into a small square `data:` URI suitable for storing
 * inline as a profile picture (the app has no object store). The image is
 * center-cropped to a `size`×`size` square and JPEG-encoded, stepping the
 * quality down until the encoded string fits `maxChars` — this keeps the upload
 * tiny and safely under the API's JSON body limit. Browser-only (uses the DOM
 * Image + canvas), so call it from client components / event handlers.
 */
export async function fileToAvatarDataUri(
  file: File,
  size = 256,
  maxChars = 90_000,
): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');

  // Center-crop the source to a square (cover), then scale into the canvas.
  const edge = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - edge) / 2;
  const sy = (img.naturalHeight - edge) / 2;
  ctx.drawImage(img, sx, sy, edge, edge, 0, 0, size, size);

  let quality = 0.85;
  let dataUri = canvas.toDataURL('image/jpeg', quality);
  while (dataUri.length > maxChars && quality > 0.3) {
    quality -= 0.15;
    dataUri = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUri;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the selected image'));
    };
    img.src = url;
  });
}
