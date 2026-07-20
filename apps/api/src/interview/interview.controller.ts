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
import { AnalyticsService } from '../analytics/analytics.service';
import { InterviewService } from './interview.service';
import { SessionOwnerGuard } from './session-owner.guard';
import { StartInterviewDto } from './dto/start-interview.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { EditSlotDto } from './dto/edit-slot.dto';

// Every interview route requires a signed-in user (pipeline is now per-user).
@UseGuards(JwtAuthGuard)
@Controller('interview')
export class InterviewController {
  constructor(
    private readonly interview: InterviewService,
    // The funnel's first two boundaries are recorded here rather than in the
    // service: `InterviewService` is the state machine, and reporting has no
    // business inside it (the same split that put the dashboard's read model in
    // `ProjectsService`).
    private readonly analytics: AnalyticsService,
  ) {}

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
  async start(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartInterviewDto,
  ): Promise<InterviewState> {
    if (isStaffUser(user.permissions)) {
      throw new ForbiddenException(
        'Staff accounts are for platform operations only and cannot create projects.',
      );
    }
    // Split the client's name AND the call notes off the idea. Everything left in
    // `input` is what the agents read and what the public share page echoes back —
    // neither the client's name nor the raw notes belongs there, so both travel as
    // separate arguments rather than riding along inside `ProjectIdeaInput`.
    const { clientName, notes, ...input } = dto;
    const state = await this.interview.start(
      input,
      user.id,
      clientName ?? null,
      notes ?? null,
    );
    // Recorded only once `start` resolves, so a 402 from the project quota is not
    // counted as an interview the user began.
    void this.analytics.recordSafe({
      type: 'interview_started',
      userId: user.id,
      meta: { sessionId: state.sessionId },
    });
    return state;
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
  async confirm(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<InterviewState> {
    const state = await this.interview.confirm(id);
    void this.analytics.recordSafe({
      type: 'interview_confirmed',
      userId: user.id,
      meta: { sessionId: id },
    });
    return state;
  }

  /**
   * Correct a slot value at the confirmation gate (owner only). Appends the
   * correction to the transcript and updates the derived snapshot to match.
   */
  @UseGuards(SessionOwnerGuard)
  @Patch(':id/slots')
  editSlot(
    @Param('id') id: string,
    @Body() dto: EditSlotDto,
  ): Promise<InterviewState> {
    return this.interview.editSlot(id, dto.slotKey, dto.value);
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
