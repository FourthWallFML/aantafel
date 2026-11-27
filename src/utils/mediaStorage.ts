/**
 * Client-side photo compression (keeps uploaded images lightweight for Firestore sync
 * and crisp in PDF exports) and IndexedDB storage for locally uploaded family cooking videos.
 */

const DB_NAME = 'tafelboek_media_db';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalVideo(file: File): Promise<string> {
  const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    tx.objectStore(VIDEO_STORE).put(file, id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalVideoUrl(videoLocalId: string): Promise<string | null> {
  if (!videoLocalId) return null;
  try {
    const db = await openMediaDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readonly');
      const req = tx.objectStore(VIDEO_STORE).get(videoLocalId);
      req.onsuccess = () => {
        const blob = req.result as Blob | undefined;
        if (blob instanceof Blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteLocalVideo(videoLocalId: string): Promise<void> {
  if (!videoLocalId) return;
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readwrite');
      tx.objectStore(VIDEO_STORE).delete(videoLocalId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IndexedDB cleanup errors
  }
}

export async function compressImageFile(
  file: File,
  maxWidth = 960,
  maxBytes = 220000
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Kon de afbeelding niet lezen.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Ongeldig afbeeldingsbestand.'));
    image.src = dataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas-context niet beschikbaar.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.8;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxBytes && quality > 0.35) {
    quality -= 0.1;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

export interface ParsedVideoSource {
  kind: 'youtube' | 'vimeo' | 'direct' | 'unknown';
  embedUrl: string;
}

export function parseVideoUrl(rawUrl: string): ParsedVideoSource | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = url.searchParams.get('v');
      if (v) {
        return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${v}` };
      }
      const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}`,
        };
      }
      const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${embedMatch[1]}`,
        };
      }
    }

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (id) {
        return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
      }
    }

    if (host === 'vimeo.com') {
      const match = url.pathname.match(/\/(\d+)/);
      if (match) {
        return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${match[1]}` };
      }
    }

    if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.pathname)) {
      return { kind: 'direct', embedUrl: trimmed };
    }

    return { kind: 'unknown', embedUrl: trimmed };
  } catch {
    return null;
  }
}
