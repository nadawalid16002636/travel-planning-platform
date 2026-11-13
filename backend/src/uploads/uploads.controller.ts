import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MulterError } from 'multer';
import type { Response } from 'express';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ApiErrors, CurrentUser, Public } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import type { JwtUser } from '../common/roles.js';
import { UploadQueryDto } from './dto/upload-query.dto.js';
import { MAX_IMAGE_BYTES } from './upload.rules.js';
import { UploadsService } from './uploads.service.js';

@Catch(MulterError)
class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
    response.status(400).json({
      statusCode: 400,
      message: exception.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : 'Upload failed',
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

@ApiTags('Uploads')
@Controller('uploads')
@UseFilters(UploadExceptionFilter)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @ApiCookieAuth()
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'GEN-08: upload a JPG or PNG (max 5 MB; 5 images, or 1 airline logo)' })
  @ApiErrors(400, 401, 403)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  create(@CurrentUser() user: JwtUser, @UploadedFile() file: Express.Multer.File, @Query() query: UploadQueryDto) {
    if (!file) throw new BadRequestException('Choose a JPG or PNG image');
    return this.uploads.validateAndStore(file, { purpose: query.purpose, entityId: query.entityId, user });
  }

  @Public()
  @Get('files/:filename')
  @ApiOperation({ summary: 'GEN-08: serve a stored image' })
  @ApiErrors([404, 'File not found'])
  async file(@Param('filename') filename: string, @Res() res: Response) {
    const image = await this.uploads.open(filename);
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.body);
  }

  @ApiCookieAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'GEN-08: delete an uploaded image' })
  @ApiErrors(401, 403, [404, 'File not found'])
  async remove(@CurrentUser() user: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    await this.uploads.remove(id, user);
    return { deleted: true };
  }
}
