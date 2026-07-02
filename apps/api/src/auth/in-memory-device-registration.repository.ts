import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateDeviceRegistrationInput,
  DeviceRegistrationRecord,
  DeviceRegistrationRepository,
} from './device-registration.repository';

/** In-memory device-registration store — used by unit tests. */
@Injectable()
export class InMemoryDeviceRegistrationRepository
  implements DeviceRegistrationRepository
{
  private readonly devices = new Map<string, DeviceRegistrationRecord>();

  async findByFingerprintHash(
    fingerprintHash: string,
  ): Promise<DeviceRegistrationRecord | null> {
    for (const record of this.devices.values()) {
      if (record.fingerprintHash === fingerprintHash) return { ...record };
    }
    return null;
  }

  async create(
    input: CreateDeviceRegistrationInput,
  ): Promise<DeviceRegistrationRecord> {
    const record: DeviceRegistrationRecord = {
      id: randomUUID(),
      fingerprintHash: input.fingerprintHash,
      userId: input.userId,
      createdAt: new Date(),
    };
    this.devices.set(record.id, record);
    return { ...record };
  }
}
