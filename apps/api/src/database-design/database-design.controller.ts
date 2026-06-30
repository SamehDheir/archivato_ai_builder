import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { DatabaseDesign } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { DatabaseDesignService } from './database-design.service';
import { UpdateDatabaseDesignDto } from './dto/update-database-design.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
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

  /** Save user edits to the database design. */
  @Put(':sessionId')
  update(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateDatabaseDesignDto,
  ): Promise<DatabaseDesign> {
    return this.databaseDesign.save(sessionId, body);
  }
}
