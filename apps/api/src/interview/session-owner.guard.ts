import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from './interview-session.repository';

/**
 * Ownership enforcement for every route that carries a session id. Runs after
 * `JwtAuthGuard` (which populates `req.user`) and rejects any request whose
 * session is missing OR owned by someone else.
 *
 * A non-owner gets a 404 (not 403) on purpose: revealing "this exists but isn't
 * yours" would leak which session ids are real. Provided + exported by
 * `InterviewModule`, so it is injectable in every pipeline module (they all
 * import `InterviewModule`, which owns `INTERVIEW_SESSION_REPOSITORY`).
 */
@Injectable()
export class SessionOwnerGuard implements CanActivate {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const user = req.user;
    if (!user) {
      // JwtAuthGuard should have run first; be defensive.
      throw new UnauthorizedException();
    }

    // Interview routes use `:id`; every downstream stage uses `:sessionId`.
    const raw = req.params.sessionId ?? req.params.id;
    const sessionId = Array.isArray(raw) ? raw[0] : raw;
    if (!sessionId) {
      throw new NotFoundException('No session id in the request.');
    }

    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== user.id) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return true;
  }
}
