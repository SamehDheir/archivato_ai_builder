import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type {
  KbPublicArticle,
  KbPublicArticleDetail,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KbService } from './kb.service';

/**
 * Public Knowledge Base — any authenticated user. Serves published articles
 * only (drafts are staff-visible via the admin routes). Optional `?q=` ranks
 * results by the same keyword scorer the AI deflection uses.
 */
@UseGuards(JwtAuthGuard)
@Controller('support/kb')
export class KbController {
  constructor(private readonly kb: KbService) {}

  @Get()
  list(@Query('q') q?: string): Promise<{ articles: KbPublicArticle[] }> {
    return this.kb.listPublic(q).then((articles) => ({ articles }));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<KbPublicArticleDetail> {
    return this.kb.getPublic(id);
  }
}
