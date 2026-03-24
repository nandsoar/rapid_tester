/**
 * Resize a base64-encoded image to fit within maxWidth × maxHeight,
 * maintaining aspect ratio. Returns a new base64 data URI (PNG).
 * If the image is already within bounds, returns it unchanged.
 */
export function resizeImageForAdo(
  dataUri: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (img.width <= maxWidth && img.height <= maxHeight) {
        resolve(dataUri)
        return
      }

      const scale = Math.min(maxWidth / img.width, maxHeight / img.height)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => reject(new Error("Failed to load image for resize"))
    img.src = dataUri
  })
}
