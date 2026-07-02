/** DI token for the device-registration store. */
export const DEVICE_REGISTRATION_REPOSITORY = Symbol(
  'DEVICE_REGISTRATION_REPOSITORY',
);

/** A device that has already registered an account (anti-spam). */
export interface DeviceRegistrationRecord {
  id: string;
  /** SHA-256 hash of the client fingerprint — never the raw value. */
  fingerprintHash: string;
  userId: string;
  createdAt: Date;
}

/** Fields needed to link a device to the account it registered. */
export interface CreateDeviceRegistrationInput {
  fingerprintHash: string;
  userId: string;
}

/**
 * Persistence seam for device→account links (Repository pattern — project
 * rule). Enforces one account per device: in-memory impl backs the unit tests,
 * the Prisma impl backs the running app.
 */
export interface DeviceRegistrationRepository {
  findByFingerprintHash(
    fingerprintHash: string,
  ): Promise<DeviceRegistrationRecord | null>;
  create(
    input: CreateDeviceRegistrationInput,
  ): Promise<DeviceRegistrationRecord>;
}
