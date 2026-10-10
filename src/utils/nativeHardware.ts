import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Checks whether the application is running in a native mobile shell (Android/iOS).
 */
export function isNativeMobile(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Captures a new comic cover photo using the device's native camera.
 * Returns a data:image/jpeg;base64 string, or null if cancelled or unavailable.
 */
export async function capturePhotoNative(): Promise<string | null> {
  if (!isNativeMobile()) return null;

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      promptLabelHeader: 'Scan Comic Cover',
      promptLabelPhoto: 'From Gallery',
      promptLabelPicture: 'Take Picture',
    });

    if (photo.base64String) {
      return `data:image/jpeg;base64,${photo.base64String}`;
    }
    return null;
  } catch (err: any) {
    if (err?.message?.includes('User cancelled photos app')) {
      return null;
    }
    console.warn('Native camera capture error:', err);
    return null;
  }
}

/**
 * Selects an image from the native photo gallery.
 */
export async function pickPhotoGalleryNative(): Promise<string | null> {
  if (!isNativeMobile()) return null;

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
    });

    if (photo.base64String) {
      return `data:image/jpeg;base64,${photo.base64String}`;
    }
    return null;
  } catch (err) {
    console.warn('Native photo gallery error:', err);
    return null;
  }
}

/**
 * Scans a comic barcode / UPC using Google ML Kit on-device scanner.
 * Returns the raw string barcode (e.g., "75960609562900111"), or null.
 */
export async function scanBarcodeNative(): Promise<string | null> {
  if (!isNativeMobile()) return null;

  try {
    // Request camera permission
    const status = await BarcodeScanner.requestPermissions();
    if (status.camera !== 'granted' && status.camera !== 'limited') {
      console.warn('Camera permission for barcode scanning not granted:', status.camera);
      return null;
    }

    const { barcodes } = await BarcodeScanner.scan();
    if (barcodes && barcodes.length > 0) {
      return barcodes[0].rawValue || null;
    }
    return null;
  } catch (err) {
    console.warn('Native barcode scan error:', err);
    return null;
  }
}
