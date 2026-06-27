import type { InterviewState, ProjectIdeaInput } from '@archivato/shared';

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
