import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';
import { UploadOptions } from './interfaces/upload-options.interface';
import { UploadResponse } from './dto/upload-response.dto';
import {
  FileSizeException,
  FileTypeException,
  UploadException,
} from './exceptions/upload.exception';

const IMAGE_RESOURCE_TYPE = 'image' as const;

const ALLOWED_IMAGE_MIMETYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly maxImageSize: number;

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
      secure: true,
    });

    this.maxImageSize =
      parseInt(
        this.configService.getOrThrow<string>('MAX_IMAGE_SIZE') || '5242880',
      ) || 5242880;
  }

  /**
   * Upload a single image to Cloudinary (`resource_type: image` only).
   */
  async uploadImage(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResponse> {
    this.validateImageFile(file);
    const uploadOptions: Record<string, unknown> = {
      resource_type: IMAGE_RESOURCE_TYPE,
      folder:
        options?.folder ||
        this.configService.get<string>('UPLOAD_DEFAULT_FOLDER') ||
        'dr_booking',
      public_id: options?.publicId,
      overwrite: true,
      invalidate: true,
    };

    if (options?.transformations?.length) {
      uploadOptions.transformation = options.transformations;
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (error) {
            this.logger.error('Cloudinary upload error:', error);
            reject(
              new UploadException(
                `We couldn't upload your image. ${error.message || 'Please try again or contact support if the problem persists.'}`,
              ),
            );
            return;
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resource_type,
            createdAt: result.created_at,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Delete an image from Cloudinary by public id (`resource_type: image` only).
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: IMAGE_RESOURCE_TYPE,
        invalidate: true,
      });
      this.logger.log(`Image deleted: ${publicId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      this.logger.error('Failed to delete image:', error);
      throw new UploadException(
        `We couldn't delete the image. ${message || 'Please try again or contact support if the problem persists.'}`,
      );
    }
  }

  private validateImageFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException(
        'No file was uploaded. Please select an image and try again.',
      );
    }

    if (file.size > this.maxImageSize) {
      throw new FileSizeException(this.formatBytes(this.maxImageSize));
    }

    if (!ALLOWED_IMAGE_MIMETYPES.has(file.mimetype)) {
      throw new FileTypeException();
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
