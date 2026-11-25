/**
 * Ruang Pulih OS — Lightweight Browser Image Compression
 * Uses HTML5 <canvas> to resize photos (rx meds, lab results) to max 1024px,
 * JPEG 0.7 quality with target < 150 KB before transmission to server.
 */

export interface CompressedImageResult {
  base64: string; // Base64 data URL (e.g. data:image/jpeg;base64,...)
  rawBase64: string; // Plain base64 without prefix
  sizeKb: number;
  mimeType: string;
}

export async function compressImageClient(
  file: File,
  maxWidth: number = 1024,
  quality: number = 0.7
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang diunggah harus berupa gambar (JPG, PNG, atau WEBP).'));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down maintaining aspect ratio
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Gagal menginisialisasi canvas untuk kompresi gambar.'));
          return;
        }

        // Draw image with smooth scaling
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const base64DataUrl = canvas.toDataURL(mimeType, quality);
        const rawBase64 = base64DataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

        // Approximate size in KB
        const sizeBytes = Math.round((rawBase64.length * 3) / 4);
        const sizeKb = Math.round((sizeBytes / 1024) * 10) / 10;

        resolve({
          base64: base64DataUrl,
          rawBase64,
          sizeKb,
          mimeType,
        });
      };

      img.onerror = () => {
        reject(new Error('Gagal memuat gambar untuk proses kompresi.'));
      };
    };

    reader.onerror = () => {
      reject(new Error('Gagal membaca file gambar.'));
    };
  });
}
