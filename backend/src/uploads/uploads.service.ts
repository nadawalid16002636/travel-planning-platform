import { Injectable } from '@nestjs/common';

export interface StoredFile {
  id: string;
  url: string;
}

/** GEN-08 image upload validation + storage. Owner: P4. */
@Injectable()
export class UploadsService {
  async validateAndStore(file: Express.Multer.File): Promise<StoredFile> {
    // TODO P4: check mimetype (jpeg/png/webp) and size limit from the requirements sheet, then store
    throw new Error('Not implemented yet');
  }

  async remove(fileId: string): Promise<void> {
    // TODO P4
  }
}
