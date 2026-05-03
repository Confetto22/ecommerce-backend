import { HttpException, HttpStatus } from '@nestjs/common';

export class UploadException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        success: false,
        message: message || 'Failed to upload file. Please try again.',
        error: 'UPLOAD_ERROR',
      },
      statusCode,
    );
  }
}

export class FileSizeException extends HttpException {
  constructor(maxSize: string) {
    super(
      {
        success: false,
        message: `File size exceeds the maximum allowed size of ${maxSize}. Please upload a smaller image.`,
        error: 'FILE_TOO_LARGE',
      },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}

export class FileTypeException extends HttpException {
  constructor() {
    super(
      {
        success: false,
        message:
          'This file type is not supported. Please upload a JPEG, PNG, GIF, WebP, or SVG image.',
        error: 'INVALID_FILE_TYPE',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
