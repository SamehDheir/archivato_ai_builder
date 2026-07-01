import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { ProductVision } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProductVisionService } from './product-vision.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('product-vision')
export class ProductVisionController {
  constructor(private readonly productVision: ProductVisionService) {}

  /** Generate (or regenerate) the product vision for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ProductVision> {
    return this.productVision.generate(sessionId);
  }

  /** Fetch a previously generated product vision. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ProductVision> {
    return this.productVision.get(sessionId);
  }
}
