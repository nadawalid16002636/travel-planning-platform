import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Model } from 'mongoose';
import { assertProvider } from '../common/guards.js';
import { Role, type JwtUser } from '../common/roles.js';
import { Upload } from './schemas/upload.schema.js';
import { inspectImage, UPLOAD_LIMITS, type UploadPurpose } from './upload.rules.js';

export interface StoredFile {
  id: string;
  url: string;
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectModel(Upload.name) private readonly uploads: Model<Upload>,
    private readonly config: ConfigService,
  ) {}

  async validateAndStore(
    file: Express.Multer.File,
    options: { purpose: UploadPurpose; entityId: string; user: JwtUser },
  ): Promise<StoredFile> {
    this.assertAllowed(options.user, options.purpose, options.entityId);
    if (!file?.buffer?.length) throw new BadRequestException('Choose a JPG or PNG image');
    let kind: 'jpeg' | 'png';
    try {
      kind = inspectImage(file?.buffer, file?.mimetype);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'type';
      throw new BadRequestException(
        reason === 'size' ? 'Image must be 5 MB or smaller' : 'Only JPG and PNG images are accepted',
      );
    }
    const count = await this.uploads.countDocuments({ purpose: options.purpose, entityId: options.entityId });
    const limit = UPLOAD_LIMITS[options.purpose];
    if (count >= limit) {
      throw new BadRequestException(
        options.purpose === 'airline-logo'
          ? 'An airline can have one logo. Delete it before uploading another'
          : `This ${options.purpose} already has ${limit} images`,
      );
    }
    const filename = `${randomBytes(16).toString('hex')}.${kind === 'jpeg' ? 'jpg' : 'png'}`;
    await mkdir(this.directory(), { recursive: true });
    await writeFile(path.join(this.directory(), filename), file.buffer);
    const url = `${this.baseUrl()}/api/uploads/files/${filename}`;
    const saved = await this.uploads.create({
      filename,
      purpose: options.purpose,
      entityId: options.entityId,
      userId: options.user.sub,
      mime: kind === 'jpeg' ? 'image/jpeg' : 'image/png',
      size: file.buffer.length,
      url,
    });
    return { id: String(saved._id), url };
  }

  async open(filename: string): Promise<{ body: Buffer; mime: string }> {
    if (!/^[a-f0-9]{32}\.(jpg|png)$/.test(filename)) throw new NotFoundException('File not found');
    const record = await this.uploads.findOne({ filename }).exec();
    if (!record) throw new NotFoundException('File not found');
    try {
      const body = await readFile(path.join(this.directory(), filename));
      return { body, mime: record.mime };
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  async remove(fileId: string, user?: JwtUser): Promise<void> {
    const record = await this.uploads.findById(fileId).exec();
    if (!record) throw new NotFoundException('File not found');
    if (user && user.role !== Role.ADMIN && record.userId !== user.sub) {
      throw new ForbiddenException('You do not own this file');
    }
    await rm(path.join(this.directory(), record.filename), { force: true });
    await record.deleteOne();
  }

  private assertAllowed(user: JwtUser, purpose: UploadPurpose, entityId: string) {
    if (user.role === Role.ADMIN) return;
    if (purpose === 'airline-logo') {
      if (user.role !== Role.AIRLINE_MOD) throw new ForbiddenException('Only the assigned airline moderator can upload a logo');
      assertProvider(entityId, user);
      return;
    }
    if (purpose === 'hotel') {
      if (user.role !== Role.HOTEL_MOD) throw new ForbiddenException('Only the assigned hotel moderator can upload hotel photos');
      assertProvider(entityId, user);
      return;
    }
    if (user.role !== Role.USER) throw new ForbiddenException('Only a registered user can upload this image');
  }

  private directory(): string {
    return this.config.get<string>('UPLOAD_DIR') || path.join(process.cwd(), 'uploads');
  }

  private baseUrl(): string {
    return (this.config.get<string>('PUBLIC_BASE_URL') || `http://localhost:${this.config.get('PORT') || 3000}`).replace(/\/$/, '');
  }
}
