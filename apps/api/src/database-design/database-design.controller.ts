import { Controller, Get, Param, Post } from '@nestjs/common';
import type { DatabaseDesign } from '@archivato/shared';
import { DatabaseDesignService } from './database-design.service';

@Controller('database-design')
export class DatabaseDesignController {
  constructor(private readonly databaseDesign: DatabaseDesignService) {}

  /** Generate (or regenerate) the database design for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<DatabaseDesign> {
    return this.databaseDesign.generate(sessionId);
  }

  /** Fetch a previously generated database design. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<DatabaseDesign> {
    return this.databaseDesign.get(sessionId);
  }
}
