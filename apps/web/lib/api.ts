import type {
  ApiDesign,
  AuthUser,
  ChangePasswordInput,
  ChatMessage,
  CheckoutResponse,
  DatabaseDesign,
  ExportBundle,
  InterviewState,
  JobStatus,
  LoginInput,
  PipelineStageName,
  ProjectIdeaInput,
  ProjectDiagrams,
  ProjectSnapshot,
  ProjectStructure,
  ProductVision,
  ProjectRoadmap,
  ProjectSummary,
  ProjectVersionDetail,
  ProjectVersionMeta,
  PlanInfo,
  RefineResult,
  RegisterInput,
  RequirementDocument,
  SubscriptionView,
  UpdateProfileInput,
  ReviewReport,
  SystemDesign,
} from '@archivato/shared';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * A cached "are we signed in?" hint (localStorage). It lets auth-aware UI on
 * public pages (the landing nav) render the right controls on first paint
 * instead of flashing while `/auth/me` round-trips. It's only a UI hint — the
 * httpOnly cookies remain the source of truth — so it's fine that it's readable.
 */
const AUTH_HINT_KEY = 'archivato_authed';

function setAuthHint(signedIn: boolean): void {
  try {
    localStorage.setItem(AUTH_HINT_KEY, signedIn ? '1' : '0');
  } catch {
    /* SSR / storage disabled — the hint is best-effort */
  }
}

/** Last-known auth state, or null if we've never checked on this device. */
export function getAuthHint(): boolean | null {
  try {
    const v = localStorage.getItem(AUTH_HINT_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

/** Endpoints that must never trigger the auto-refresh-and-retry (avoids loops). */
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

/** Error thrown by `request` on a non-2xx response, carrying the HTTP status and
 *  optional server `code` (e.g. `quota_exceeded`, `upgrade_required`) so callers
 *  can branch on the specific failure — like opening the upgrade modal on a 402. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    // Send/receive the httpOnly auth cookies (Slice 9).
    credentials: 'include',
    ...init,
  });

  // The access token is short-lived. If it has expired, transparently rotate it
  // via the (long-lived) refresh cookie and retry the request once.
  if (
    res.status === 401 &&
    allowRefresh &&
    !NO_REFRESH.some((p) => path.startsWith(p))
  ) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) {
      return request<T>(path, init, false);
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message ?? detail;
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(detail, res.status, code);
  }

  return res.json() as Promise<T>;
}

export const interviewApi = {
  /** The signed-in user's projects, most recently updated first. */
  list: () => request<ProjectSummary[]>('/interview'),

  start: (input: ProjectIdeaInput) =>
    request<InterviewState>('/interview', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  answer: (sessionId: string, answer: string) =>
    request<InterviewState>(`/interview/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),

  confirm: (sessionId: string) =>
    request<InterviewState>(`/interview/${sessionId}/confirm`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<InterviewState>(`/interview/${sessionId}`),

  /** Permanently delete a project and all its artifacts (frees a quota slot). */
  delete: (sessionId: string) =>
    request<{ success: true }>(`/interview/${sessionId}`, { method: 'DELETE' }),
};

/** The editable fields of an artifact (sessionId/generatedAt are server-set). */
type Editable<T> = Omit<T, 'sessionId' | 'generatedAt'>;

export const requirementsApi = {
  generate: (sessionId: string) =>
    request<RequirementDocument>(`/requirements/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<RequirementDocument>(`/requirements/${sessionId}`),

  update: (sessionId: string, doc: Editable<RequirementDocument>) =>
    request<RequirementDocument>(`/requirements/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    }),
};

export const systemDesignApi = {
  generate: (sessionId: string) =>
    request<SystemDesign>(`/system-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<SystemDesign>(`/system-design/${sessionId}`),

  update: (sessionId: string, design: Editable<SystemDesign>) =>
    request<SystemDesign>(`/system-design/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(design),
    }),
};

export const databaseDesignApi = {
  generate: (sessionId: string) =>
    request<DatabaseDesign>(`/database-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<DatabaseDesign>(`/database-design/${sessionId}`),

  update: (sessionId: string, design: Editable<DatabaseDesign>) =>
    request<DatabaseDesign>(`/database-design/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(design),
    }),
};

export const apiDesignApi = {
  generate: (sessionId: string) =>
    request<ApiDesign>(`/api-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ApiDesign>(`/api-design/${sessionId}`),

  update: (sessionId: string, design: Editable<ApiDesign>) =>
    request<ApiDesign>(`/api-design/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(design),
    }),
};

export const reviewApi = {
  generate: (sessionId: string) =>
    request<ReviewReport>(`/review/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ReviewReport>(`/review/${sessionId}`),
};

export const productVisionApi = {
  generate: (sessionId: string) =>
    request<ProductVision>(`/product-vision/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<ProductVision>(`/product-vision/${sessionId}`),
};

export const roadmapApi = {
  generate: (sessionId: string) =>
    request<ProjectRoadmap>(`/roadmap/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ProjectRoadmap>(`/roadmap/${sessionId}`),
};

export const chatApi = {
  /** Send a refinement instruction; returns the updated artifacts + transcript. */
  refine: (sessionId: string, instruction: string) =>
    request<RefineResult>(`/chat/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
    }),

  /** Load the saved conversation for a session. */
  messages: (sessionId: string) =>
    request<ChatMessage[]>(`/chat/${sessionId}`),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const jobsApi = {
  /** Enqueue async generation of a pipeline stage. */
  enqueue: (sessionId: string, stage: PipelineStageName) =>
    request<JobStatus>(`/jobs/${sessionId}/${stage}`, { method: 'POST' }),

  /** Poll a single job's status. */
  status: (sessionId: string, jobId: string) =>
    request<JobStatus>(`/jobs/${sessionId}/${jobId}`),

  /**
   * Enqueue a stage, then poll until it finishes, returning the generated
   * artifact (typed by the caller). `onProgress` receives each status update so
   * the UI can show a live progress bar.
   */
  run: async <T>(
    sessionId: string,
    stage: PipelineStageName,
    onProgress?: (status: JobStatus) => void,
  ): Promise<T> => {
    const job = await jobsApi.enqueue(sessionId, stage);
    let status = job;
    onProgress?.(status);
    for (let i = 0; i < 180; i++) {
      if (status.state === 'completed') return status.result as T;
      if (status.state === 'failed') {
        throw new Error(status.error || 'Generation failed.');
      }
      await sleep(700);
      status = await jobsApi.status(sessionId, job.id);
      onProgress?.(status);
    }
    throw new Error('Generation timed out. Please try again.');
  },
};

export const versionsApi = {
  /** Version history for a project (newest first). */
  list: (sessionId: string) =>
    request<ProjectVersionMeta[]>(`/versions/${sessionId}`),

  /** One version with its full artifact snapshot (for compare). */
  get: (sessionId: string, version: number) =>
    request<ProjectVersionDetail>(`/versions/${sessionId}/${version}`),

  /** Restore the project to a version; returns the restored snapshot. */
  restore: (sessionId: string, version: number) =>
    request<ProjectSnapshot>(`/versions/${sessionId}/${version}/restore`, {
      method: 'POST',
    }),
};

export const diagramsApi = {
  /** Architecture diagrams (Mermaid source per diagram) for a project. */
  get: (sessionId: string) =>
    request<ProjectDiagrams>(`/diagrams/${sessionId}`),
};

async function requestText(path: string): Promise<string> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(res.statusText);
  return res.text();
}

export const authApi = {
  register: async (input: RegisterInput) => {
    const user = await request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthHint(true);
    return user;
  },

  login: async (input: LoginInput) => {
    const user = await request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthHint(true);
    return user;
  },

  logout: async () => {
    const res = await request<{ success: true }>('/auth/logout', {
      method: 'POST',
    });
    setAuthHint(false);
    return res;
  },

  /** Update the signed-in user's profile (display name). */
  updateProfile: (input: UpdateProfileInput) =>
    request<AuthUser>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /** Change/set the password. Stays signed in here; other sessions are revoked. */
  changePassword: (input: ChangePasswordInput) =>
    request<AuthUser>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Permanently delete the signed-in account (irreversible). */
  deleteAccount: async () => {
    const res = await request<{ success: true }>('/auth/me', {
      method: 'DELETE',
    });
    setAuthHint(false);
    return res;
  },

  /** Current user, or null if not authenticated (401). Refreshes the auth hint. */
  me: async (): Promise<AuthUser | null> => {
    try {
      const user = await request<AuthUser>('/auth/me');
      setAuthHint(true);
      return user;
    } catch {
      setAuthHint(false);
      return null;
    }
  },

  /** Confirm an email-verification token (from the link in the email). */
  verifyEmail: (token: string) =>
    request<AuthUser>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  /** Re-send the verification email to the signed-in user. */
  resendVerification: () =>
    request<{ success: true }>('/auth/resend-verification', {
      method: 'POST',
    }),

  /** Request a password-reset OTP by email (always succeeds — no enumeration). */
  forgotPassword: (email: string) =>
    request<{ success: true }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /** Submit the emailed OTP + a new password. */
  resetPassword: (email: string, code: string, newPassword: string) =>
    request<{ success: true }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    }),

  /** Which OAuth providers are configured on the server. */
  oauthProviders: () =>
    request<{ google: boolean; github: boolean }>('/auth/oauth/providers'),

  /**
   * Full-page URL that starts an OAuth login (browser navigates here). Pass a
   * device fingerprint so a NEW OAuth account is device-gated like local
   * registration (one account per device).
   */
  oauthStartUrl: (provider: 'google' | 'github', fingerprint?: string) =>
    `${API_URL}/auth/oauth/${provider}/start${
      fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : ''
    }`,
};

export const billingApi = {
  /** Public plan catalogue (pricing page). */
  plans: () => request<PlanInfo[]>('/billing/plans'),

  /** The signed-in user's subscription + quota usage. */
  subscription: () => request<SubscriptionView>('/billing'),

  /** Upgrade to Pro (mock activates instantly; Paddle returns checkout params). */
  checkout: () =>
    request<CheckoutResponse>('/billing/checkout', { method: 'POST' }),

  /** Cancel Pro. */
  cancel: () => request<SubscriptionView>('/billing/cancel', { method: 'POST' }),
};

export const exportApi = {
  json: (sessionId: string) =>
    request<ExportBundle>(`/export/${sessionId}/json`),
  markdown: (sessionId: string) =>
    requestText(`/export/${sessionId}/markdown`),
  openapi: (sessionId: string) =>
    request<Record<string, unknown>>(`/export/${sessionId}/openapi`),
  structure: (sessionId: string) =>
    request<ProjectStructure>(`/export/${sessionId}/structure`),
};
