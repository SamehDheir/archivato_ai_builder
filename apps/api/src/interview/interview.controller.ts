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
import { RenameProjectDto } from './dto/rename-project.dto';

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
    return this.interview.start(dto, user.id);
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

  /** Rename a project — set or clear its display name (owner only). */
  @UseGuards(SessionOwnerGuard)
  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameProjectDto,
  ): Promise<ProjectSummary> {
    return this.interview.rename(id, dto.title);
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
