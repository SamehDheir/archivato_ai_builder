import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects a route: requires a valid access-token cookie. Apply with
 * `@UseGuards(JwtAuthGuard)`. Pipeline routes stay public for now; ownership
 * enforcement is a focused follow-up (see CLAUDE.md).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
