import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PROPOSAL_CHANNELS,
  PROPOSAL_LOCALES,
  type ProposalChannel,
  type ProposalLocale,
} from '@archivato/shared';

/**
 * The owner's controls for one proposal message (`POST /proposal/:id/generate`).
 *
 * Only `channel` is required — everything else narrows a message that is already
 * generatable from the scoping alone.
 */
export class GenerateProposalDto {
  /**
   * Where the message is going. `@IsIn` over the shared union, so junk is a **400**
   * rather than a silent fallback to a different channel's ceiling and language.
   */
  @IsIn(PROPOSAL_CHANNELS as readonly string[])
  channel!: ProposalChannel;

  /**
   * Explicit language override. Omitted ⇒ the channel's default (Mostaql → Arabic,
   * Upwork → English), then `projectLocale`.
   */
  @IsOptional()
  @IsIn(PROPOSAL_LOCALES as readonly string[])
  locale?: ProposalLocale;

  /**
   * The owner's working locale, used only when the channel has no language opinion
   * (email / generic). The session has no locale of its own, and this is the
   * closest honest stand-in for "the project's language".
   */
  @IsOptional()
  @IsIn(PROPOSAL_LOCALES as readonly string[])
  projectLocale?: ProposalLocale;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  /**
   * Whether the message states a price. Defaults **false**: pricing in the covering
   * message is a deal decision the owner makes per bid, and defaulting it on would
   * quote a client a figure the owner never consciously approved.
   */
  @IsOptional()
  @IsBoolean()
  includePrice?: boolean;

  /**
   * The price, in the owner's own words, inserted verbatim ("$6,000 – $9,000",
   * "5,000 USD fixed, 3 milestones"). Read **only** when `includePrice` is true —
   * the service drops it otherwise, so a stale value left in the form can never
   * reach the model.
   *
   * Free text rather than a structured amount on purpose: this market quotes in
   * several currencies and routinely attaches terms a `{min, max, currency}` shape
   * cannot carry. The model never derives it — it is copied or it is absent.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  price?: string;

  /** A line the owner wants woven in — usually a reference to the client's posting. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  customHook?: string;

  /**
   * Which draft this is: 0 for the first, incremented by "Regenerate" to ask for a
   * different angle. Bounded because it only ever selects an angle/opening.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  variant?: number;
}
