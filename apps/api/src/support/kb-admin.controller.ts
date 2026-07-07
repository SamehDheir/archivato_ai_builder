import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { KbArticle, KbArticleSummary } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { KbService } from './kb.service';
import { CreateKbArticleDto, UpdateKbArticleDto } from './dto/create-kb-article.dto';

/**
 * Knowledge Base management — staff holding `support:kb:manage` (Support Agent +
 * Super Admin out of the box). Full CRUD, including drafts. Separate from the
 * ticket-admin controller (which gates on `support:read_all`), so KB authoring
 * is an independent capability.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('support:kb:manage')
@Controller('support/admin/kb')
export class KbAdminController {
  constructor(private readonly kb: KbService) {}

  @Get()
  list(): Promise<{ articles: KbArticleSummary[] }> {
    return this.kb.adminList().then((articles) => ({ articles }));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<KbArticle> {
    return this.kb.adminGet(id);
  }

  @Post()
  create(@Body() body: CreateKbArticleDto): Promise<KbArticle> {
    return this.kb.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateKbArticleDto,
  ): Promise<KbArticle> {
    return this.kb.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.kb.remove(id);
  }
}
