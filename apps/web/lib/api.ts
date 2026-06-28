import type {
  ApiDesign,
  AuthUser,
  DatabaseDesign,
  ExportBundle,
  InterviewState,
  LoginInput,
  ProjectIdeaInput,
  ProjectStructure,
  RegisterInput,
  RequirementDocument,
  ReviewReport,
  SystemDesign,
} from '@archivato/shared';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Endpoints that must never trigger the auto-refresh-and-retry (avoids loops). */
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

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
    try {
      const body = await res.json();
      detail = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export const interviewApi = {
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
};

export const requirementsApi = {
  generate: (sessionId: string) =>
    request<RequirementDocument>(`/requirements/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<RequirementDocument>(`/requirements/${sessionId}`),
};

export const systemDesignApi = {
  generate: (sessionId: string) =>
    request<SystemDesign>(`/system-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<SystemDesign>(`/system-design/${sessionId}`),
};

export const databaseDesignApi = {
  generate: (sessionId: string) =>
    request<DatabaseDesign>(`/database-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<DatabaseDesign>(`/database-design/${sessionId}`),
};

export const apiDesignApi = {
  generate: (sessionId: string) =>
    request<ApiDesign>(`/api-design/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ApiDesign>(`/api-design/${sessionId}`),
};

export const reviewApi = {
  generate: (sessionId: string) =>
    request<ReviewReport>(`/review/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ReviewReport>(`/review/${sessionId}`),
};

async function requestText(path: string): Promise<string> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(res.statusText);
  return res.text();
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: LoginInput) =>
    request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<{ success: true }>('/auth/logout', { method: 'POST' }),

  /** Current user, or null if not authenticated (401). */
  me: async (): Promise<AuthUser | null> => {
    try {
      return await request<AuthUser>('/auth/me');
    } catch {
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
