import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/** Password hashing/verification (bcrypt). Isolated so it can be swapped/mocked. */
@Injectable()
export class PasswordService {
  private readonly rounds = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
