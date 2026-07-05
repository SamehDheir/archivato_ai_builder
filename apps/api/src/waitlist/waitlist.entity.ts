/** A persisted waitlist signup. Mapped onto the Prisma `waitlist_entries` table. */
export interface WaitlistEntry {
  id: string;
  /** Stored normalized (trimmed + lowercased); unique. */
  email: string;
  locale: string | null;
  source: string | null;
  createdAt: Date;
}
