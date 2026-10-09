import {
  Controller,
  Get,
  Put,
  Param,
  Req,
  Res,
  Inject,
  HttpStatus,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';

import { OBJECT_STORAGE_TOKEN } from './storage.service';

import type { IObjectStorage } from './storage.service';
import type { Request, Response } from 'express';

@Controller('storage')
export class StorageController {
  constructor(@Inject(OBJECT_STORAGE_TOKEN) private readonly storageService: IObjectStorage) {}

  @Put('upload/:key')
  @HttpCode(HttpStatus.OK)
  async uploadSingleParamObject(@Param('key') key: string, @Req() req: Request) {
    return this.handleUpload(key, req);
  }

  @Put('upload/*')
  @HttpCode(HttpStatus.OK)
  async uploadWildcardObject(@Req() req: Request) {
    const rawKey: string =
      (req.params as Record<string, string>)[0] ||
      (req.url.split('/storage/upload/')[1] || '').split('?')[0] ||
      '';
    return this.handleUpload(rawKey, req);
  }

  private async handleUpload(rawKey: string, req: Request) {
    const decodedKey = decodeURIComponent(rawKey);
    const contentType = (req.headers['content-type'] as string) || 'application/octet-stream';

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);

    await this.storageService.putObject(decodedKey, data, { contentType });

    return {
      success: true,
      key: decodedKey,
      size: data.length,
      contentType,
    };
  }

  @Get('download/:key')
  async downloadSingleParamObject(@Param('key') key: string, @Res() res: Response) {
    return this.handleDownload(key, res);
  }

  @Get('download/*')
  async downloadWildcardObject(@Req() req: Request, @Res() res: Response) {
    const rawKey: string =
      (req.params as Record<string, string>)[0] ||
      (req.url.split('/storage/download/')[1] || '').split('?')[0] ||
      '';
    return this.handleDownload(rawKey, res);
  }

  private async handleDownload(rawKey: string, res: Response) {
    const decodedKey = decodeURIComponent(rawKey);

    try {
      const buffer = await this.storageService.getObject(decodedKey);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch {
      throw new NotFoundException(`Object not found: ${decodedKey}`);
    }
  }
}
