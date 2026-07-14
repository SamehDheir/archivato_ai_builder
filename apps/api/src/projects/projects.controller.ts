import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser, ProjectOverview } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProjectsService } from './projects.service';

/**
 * The dashboard's list. Scoped to the caller by construction (`user.id` — never a
 * path param), so there is no session to own and no owner guard to apply: a user
 * can only ever ask for their own scopings.
 *
 * `GET /interview` still returns the lean summaries; this route adds the pipeline
 * + share state the deal board needs, and nothing else.
 */
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ProjectOverview[]> {
    return this.projects.list(user.id);
  }
}
