import { IsString, Matches, MaxLength } from 'class-validator';
import type { UpdateAvatarInput } from '@archivato/shared';

/**
 * A base64 image `data:` URI (png/jpeg/webp/gif). The client resizes the picture
 * to a small square before upload, so real payloads are tiny; the length cap is
 * a hard safety limit that also keeps the JSON body under Express's default
 * ~100 KB parse limit (the picture is stored inline — the app has no object store).
 */
const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export class UpdateAvatarDto implements UpdateAvatarInput {
  @IsString()
  @MaxLength(100_000, { message: 'Image is too large; use a smaller picture' })
  @Matches(IMAGE_DATA_URI, {
    message: 'avatarUrl must be a base64 data URI for a png, jpeg, webp, or gif image',
  })
  avatarUrl!: string;
}
