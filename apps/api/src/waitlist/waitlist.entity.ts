/** A persisted waitlist signup. Mapped onto the Prisma `waitlist_entries` table. */
export interface WaitlistEntry {
  id: string;
  /** Stored normalized (trimmed + lowercased); unique. */
  email: string;
  locale: string | null;
  source: string | null;
  /** ISO-3166-1 alpha-2 country derived from the signup request, or null. */
  country: string | null;
  createdAt: Date;
}
