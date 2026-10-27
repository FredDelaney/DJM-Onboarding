// Convert approved HTTPS logos to a raster asset supported by both exporters.
// A blocked/unavailable image leaves the agency's text branding intact.
import { safeDocumentLogoUrl } from "./agency-documents";
export type DocumentLogo = { dataUrl: string; width: number; height: number };
export async function documentLogo(
  value: string,
): Promise<DocumentLogo | undefined> {
  const url = safeDocumentLogoUrl(value);
  if (!url) return;
  return new Promise((resolve) => {
    const image = new window.Image();
    let done = false;
    const finish = (data?: DocumentLogo) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(data);
    };
    const timer = setTimeout(() => finish(), 5000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(
          1,
          600 / image.naturalWidth,
          240 / image.naturalHeight,
        );
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) {
          finish();
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const exportScale = Math.min(90 / canvas.width, 42 / canvas.height);
        finish({
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width * exportScale,
          height: canvas.height * exportScale,
        });
      } catch {
        finish();
      }
    };
    image.onerror = () => finish();
    image.src = url;
  });
}
