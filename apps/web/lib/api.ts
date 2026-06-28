import type {
  ApiDesign,
  DatabaseDesign,
  ExportBundle,
  InterviewState,
  ProjectIdeaInput,
  ProjectStructure,
  RequirementDocument,
  ReviewReport,
  SystemDesign,
} from '@archivato/shared';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

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
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.text();
}

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
