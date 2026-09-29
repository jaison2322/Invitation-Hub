import { supabase, getActiveSessionVipId } from '../utils/supabase';

// In-memory cache for generated signed URLs to minimize redundant network roundtrips
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Utility: Convert a base64 data URL to a binary Blob
 */
function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string; extension: string } {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let extension = 'jpg';
  if (mimeType.includes('png')) extension = 'png';
  else if (mimeType.includes('webp')) extension = 'webp';
  else if (mimeType.includes('heic')) extension = 'heic';
  else if (mimeType.includes('gif')) extension = 'gif';

  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  return { blob, mimeType, extension };
}

export const storageService = {
  /**
   * Upload an invitation photo to Supabase Storage in the private 'invitations' bucket.
   * Path convention enforces strict VIP isolation:
   *   {vipId}/{eventId}/invitation_{timestamp}_{random}.{ext}
   */
  async uploadInvitationImage(
    imageSource: string | Blob | File,
    vipId?: string,
    eventId?: string
  ): Promise<{ path: string; signedUrl?: string } | null> {
    try {
      const targetVipId = vipId || getActiveSessionVipId() || 'vip_default';
      const targetEventId = eventId || `event_${Date.now()}`;
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const timestamp = Date.now();

      let blob: Blob;
      let mimeType = 'image/jpeg';
      let extension = 'jpg';

      if (typeof imageSource === 'string') {
        if (imageSource.startsWith('data:')) {
          const converted = dataUrlToBlob(imageSource);
          blob = converted.blob;
          mimeType = converted.mimeType;
          extension = converted.extension;
        } else if (imageSource.startsWith('http')) {
          // Already an external URL or existing URL, return as path
          return { path: imageSource, signedUrl: imageSource };
        } else {
          console.warn('[StorageService] Unrecognized string format for imageSource');
          return null;
        }
      } else if (imageSource instanceof File || imageSource instanceof Blob) {
        blob = imageSource;
        mimeType = imageSource.type || 'image/jpeg';
        if (mimeType.includes('png')) extension = 'png';
        else if (mimeType.includes('webp')) extension = 'webp';
      } else {
        return null;
      }

      // Secure isolated path
      const storagePath = `${targetVipId}/${targetEventId}/invitation_${timestamp}_${randomSuffix}.${extension}`;

      console.log(`[StorageService] Uploading photo for VIP ${targetVipId}, Event ${targetEventId}: ${storagePath}`);

      const { data, error } = await supabase.storage
        .from('invitations')
        .upload(storagePath, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        console.error('[StorageService] Upload failed:', error);
        return null;
      }

      // Generate a signed URL valid for 7 days
      let signedUrl: string | undefined;
      try {
        const { data: signData, error: signError } = await supabase.storage
          .from('invitations')
          .createSignedUrl(data.path, 60 * 60 * 24 * 7);

        if (!signError && signData?.signedUrl) {
          signedUrl = signData.signedUrl;
          signedUrlCache.set(data.path, {
            url: signedUrl,
            expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
          });
        }
      } catch (signErr) {
        console.warn('[StorageService] Could not generate initial signed URL:', signErr);
      }

      return {
        path: data.path,
        signedUrl,
      };
    } catch (err) {
      console.error('[StorageService] Exception during invitation image upload:', err);
      return null;
    }
  },

  /**
   * Retrieve a secure, signed URL for an invitation photo.
   * Leverages in-memory cache to prevent repeated API calls.
   */
  async getInvitationImageUrl(storagePath?: string | null): Promise<string | null> {
    if (!storagePath) return null;

    // Direct data URL or external HTTP URL
    if (storagePath.startsWith('data:') || storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    // Check memory cache
    const cached = signedUrlCache.get(storagePath);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    try {
      // Create a fresh signed URL valid for 7 days
      const { data, error } = await supabase.storage
        .from('invitations')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      if (error || !data?.signedUrl) {
        console.warn('[StorageService] Failed to generate signed URL for path:', storagePath, error);
        return null;
      }

      signedUrlCache.set(storagePath, {
        url: data.signedUrl,
        expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
      });

      return data.signedUrl;
    } catch (err) {
      console.warn('[StorageService] Exception generating signed URL:', err);
      return null;
    }
  },

  /**
   * Delete an invitation image from Supabase Storage.
   * Strictly enforces that the file belongs to the caller's VIP folder.
   */
  async deleteInvitationImage(storagePath: string, vipId?: string): Promise<boolean> {
    if (!storagePath) return false;

    // Do not attempt to delete local data URLs or external links
    if (storagePath.startsWith('data:') || storagePath.startsWith('http')) {
      return true;
    }

    const targetVipId = vipId || getActiveSessionVipId();
    if (targetVipId && !storagePath.startsWith(`${targetVipId}/`)) {
      console.error(`[StorageService Security Error] Unauthorized delete attempt: Path "${storagePath}" does not belong to VIP "${targetVipId}".`);
      return false;
    }

    try {
      const { error } = await supabase.storage
        .from('invitations')
        .remove([storagePath]);

      if (error) {
        console.error('[StorageService] Failed to delete image from storage:', error);
        return false;
      }

      signedUrlCache.delete(storagePath);
      return true;
    } catch (err) {
      console.error('[StorageService] Exception deleting invitation image:', err);
      return false;
    }
  },
};
