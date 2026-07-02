import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ProGuard } from './pro.guard';
import { BILLING_PROVIDER, type BillingProvider } from './billing.provider';
import { MockBillingProvider } from './mock-billing.provider';
import { PaddleBillingProvider } from './paddle-billing.provider';
import { SUBSCRIPTION_REPOSITORY } from './subscription.repository';
import { PrismaSubscriptionRepository } from './prisma-subscription.repository';

/**
 * Billing (subscriptions + project quota). Payments sit behind a
 * `BillingProvider` chosen like the LLM provider: `BILLING_PROVIDER=mock|paddle`
 * forces it; else Paddle when `PADDLE_API_KEY` is set; else the offline mock.
 * Exports `BillingService` so the interview module can enforce quota at confirm.
 */
@Module({
  imports: [AuthModule], // provides USER_REPOSITORY (for the customer email)
  controllers: [BillingController],
  providers: [
    BillingService,
    ProGuard,
    MockBillingProvider,
    PaddleBillingProvider,
    { provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService, MockBillingProvider, PaddleBillingProvider],
      useFactory: (
        config: ConfigService,
        mock: MockBillingProvider,
        paddle: PaddleBillingProvider,
      ): BillingProvider => {
        const forced = config.get<string>('BILLING_PROVIDER');
        const provider =
          forced === 'paddle'
            ? paddle
            : forced === 'mock'
              ? mock
              : config.get<string>('PADDLE_API_KEY')
                ? paddle
                : mock;
        new Logger('BillingModule').log(`Billing provider: ${provider.id}`);
        return provider;
      },
    },
  ],
  exports: [BillingService, ProGuard],
})
export class BillingModule {}
