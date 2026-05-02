export interface UploadOptions {
  folder?: string;
  publicId?: string;
  overwrite?: boolean;
  /** Cloudinary transformation options (images only). */
  transformations?: Record<string, unknown>[];
}
