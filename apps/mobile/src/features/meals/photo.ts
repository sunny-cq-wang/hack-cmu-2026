/**
 * The one place a meal photo becomes something we are willing to upload:
 * max 1024 px wide, JPEG, quality 0.8 (docs/API_CONTRACTS.md §2).
 *
 * SDK 57 deprecated `manipulateAsync()` in favour of the chainable context API,
 * so this is `ImageManipulator.manipulate()` → `renderAsync()` → `saveAsync()`.
 * Same output as the old call, different spelling.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_UPLOAD_WIDTH_PX = 1024;
export const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * @param sourceWidth width of the original, when the caller knows it. Photos already
 * narrower than the cap are left alone rather than upscaled.
 * @returns a local file URI for the JPEG to send to `POST /meals/analyze`.
 */
export async function prepareMealPhoto(uri: string, sourceWidth?: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (sourceWidth === undefined || sourceWidth > MAX_UPLOAD_WIDTH_PX) {
    context.resize({ width: MAX_UPLOAD_WIDTH_PX });
  }
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    // The bitmap can be tens of megabytes; the file on disk is what we actually need.
    image.release();
  }
}
