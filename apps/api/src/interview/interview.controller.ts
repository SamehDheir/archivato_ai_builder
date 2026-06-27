import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { InterviewState } from '@archivato/shared';
import { InterviewService } from './interview.service';
import { StartInterviewDto } from './dto/start-interview.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@Controller('interview')
export class InterviewController {
  constructor(private readonly interview: InterviewService) {}

  /** Begin a new interview from a raw idea. */
  @Post()
  start(@Body() dto: StartInterviewDto): Promise<InterviewState> {
    return this.interview.start(dto);
  }

  /** Fetch current session state. */
  @Get(':id')
  get(@Param('id') id: string): Promise<InterviewState> {
    return this.interview.getState(id);
  }

  /** Answer the current question and advance. */
  @Post(':id/answer')
  answer(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
  ): Promise<InterviewState> {
    return this.interview.answer(id, dto.answer);
  }

  /** Confirm the summarized requirements (the gate). */
  @Post(':id/confirm')
  confirm(@Param('id') id: string): Promise<InterviewState> {
    return this.interview.confirm(id);
  }
}
