import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadImageDto } from './dto/upload-image.dto';
import { UploadResponse } from './dto/upload-response.dto';
import { DeleteImageDto } from './dto/delete-image.dto';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadImageDto,
  ): Promise<UploadResponse> {
    return await this.uploadService.uploadImage(file, {
      folder: dto.folder,
      publicId: dto.publicId,
      overwrite: dto.overwrite,
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async deleteImage(
    @Body() body: DeleteImageDto,
  ): Promise<{ message: string }> {
    await this.uploadService.deleteImage(body.publicId);
    return { message: 'Image deleted successfully' };
  }
}
