import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  isStaffUser,
  type AuthUser,
  type InterviewState,
  type ProjectSummary,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { InterviewService } from './interview.service';
import { SessionOwnerGuard } from './session-owner.guard';
import { StartInterviewDto } from './dto/start-interview.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

// Every interview route requires a signed-in user (pipeline is now per-user).
@UseGuards(JwtAuthGuard)
@Controller('interview')
export class InterviewController {
  constructor(private readonly interview: InterviewService) {}

  /** List the signed-in user's projects ("my projects"). */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ProjectSummary[]> {
    return this.interview.list(user.id);
  }

  /**
   * Begin a new interview from a raw idea, owned by the current user. Staff
   * accounts (support / billing / admin — anyone holding a permission) are
   * console-only and cannot create projects.
   */
  @Post()
  start(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartInterviewDto,
  ): Promise<InterviewState> {
    if (isStaffUser(user.permissions)) {
      throw new ForbiddenException(
        'Staff accounts are for platform operations only and cannot create projects.',
      );
    }
    // Split the client's name off the idea. Everything left in `input` is what the
    // agents read and what the public share page echoes back — the client's name
    // belongs to neither, so it travels as a separate argument rather than riding
    // along inside `ProjectIdeaInput`.
    const { clientName, ...input } = dto;
    return this.interview.start(input, user.id, clientName ?? null);
  }

  /** Fetch current session state (owner only). */
  @UseGuards(SessionOwnerGuard)
  @Get(':id')
  get(@Param('id') id: string): Promise<InterviewState> {
    return this.interview.getState(id);
  }

  /** Answer the current question and advance (owner only). */
  @UseGuards(SessionOwnerGuard)
  @Post(':id/answer')
  answer(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
  ): Promise<InterviewState> {
    return this.interview.answer(id, dto.answer);
  }

  /** Confirm the summarized requirements — the gate (owner only). */
  @UseGuards(SessionOwnerGuard)
  @Post(':id/confirm')
  confirm(@Param('id') id: string): Promise<InterviewState> {
    return this.interview.confirm(id);
  }

  /**
   * Update a project's labels — its display name and/or the client it's scoped
   * for (owner only). An omitted field is left alone; a blank one clears it.
   */
  @UseGuards(SessionOwnerGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectSummary> {
    return this.interview.update(id, dto);
  }

  /** Delete a project and all of its artifacts (owner only). Frees a quota slot. */
  @UseGuards(SessionOwnerGuard)
  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string): Promise<{ success: true }> {
    await this.interview.deleteProject(id);
    return { success: true };
  }
}
