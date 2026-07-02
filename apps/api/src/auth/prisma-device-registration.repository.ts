import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateDeviceRegistrationInput,
  DeviceRegistrationRecord,
  DeviceRegistrationRepository,
} from './device-registration.repository';

/** PostgreSQL-backed device-registration store. */
@Injectable()
export class PrismaDeviceRegistrationRepository
  implements DeviceRegistrationRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findByFingerprintHash(
    fingerprintHash: string,
  ): Promise<DeviceRegistrationRecord | null> {
    const row = await this.prisma.deviceRegistration.findUnique({
      where: { fingerprintHash },
    });
    return row ? toEntity(row) : null;
  }

  async create(
    input: CreateDeviceRegistrationInput,
  ): Promise<DeviceRegistrationRecord> {
    const row = await this.prisma.deviceRegistration.create({
      data: {
        fingerprintHash: input.fingerprintHash,
        userId: input.userId,
      },
    });
    return toEntity(row);
  }
}

function toEntity(row: {
  id: string;
  fingerprintHash: string;
  userId: string;
  createdAt: Date;
}): DeviceRegistrationRecord {
  return {
    id: row.id,
    fingerprintHash: row.fingerprintHash,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}
