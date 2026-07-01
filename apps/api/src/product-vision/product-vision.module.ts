import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { ProductManagerAgent } from '../llm/agents/product-manager.agent';
import { ProductVisionController } from './product-vision.controller';
import { ProductVisionService } from './product-vision.service';
import { PRODUCT_VISION_REPOSITORY } from './product-vision.repository';
import { PrismaProductVisionRepository } from './prisma-product-vision.repository';

@Module({
  // Only the interview is needed — the vision is a standalone artifact.
  imports: [InterviewModule],
  controllers: [ProductVisionController],
  providers: [
    ProductVisionService,
    ProductManagerAgent,
    {
      provide: PRODUCT_VISION_REPOSITORY,
      useClass: PrismaProductVisionRepository,
    },
  ],
  // Exported so version snapshot/restore can include the product vision later.
  exports: [PRODUCT_VISION_REPOSITORY, ProductVisionService],
})
export class ProductVisionModule {}
