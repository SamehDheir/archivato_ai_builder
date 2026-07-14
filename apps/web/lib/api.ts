import type {
  AccountRole,
  AdminLlmUsage,
  AdminStats,
  AdminTraffic,
  AdminUsersPage,
  ApiDesign,
  AuthUser,
  BillingCycle,
  ChangePasswordInput,
  ChatMessage,
  CheckoutResponse,
  DatabaseDesign,
  DecisionExplanation,
  DecisionRef,
  ExportBundle,
  InterviewState,
  JobStatus,
  LoginInput,
  NotificationsPage,
  PipelineStageName,
  ProjectIdeaInput,
  ProjectDiagrams,
  ProjectSnapshot,
  ProjectStructure,
  ScaffoldManifest,
  ScaffoldTarget,
  GithubPushResult,
  GithubConnectionStatus,
  ProductVision,
  ProjectRoadmap,
  CostEstimate,
  ProjectSummary,
  ProjectVersionDetail,
  ProjectVersionMeta,
  PlanInfo,
  RefineResult,
  RegisterInput,
  RequirementDocument,
  ShareLink,
  SharedProject,
  SubscriptionView,
  UpdateProfileInput,
  ReviewReport,
  SystemDesign,
  ThreatModel,
  QaPlan,
  CreateRoleInput,
  RoleView,
  UpdateRoleInput,
  ProvisionUserInput,
  ProvisionedUser,
  WaitlistSignupInput,
  WaitlistSignupResult,
  WaitlistAdminPage,
  BillingAdminData,
  BillingAdminFilter,
  BillingSubscriptionDetail,
  BillingTrends,
  CreateSupportTicketInput,
  KbArticle,
  KbArticleSummary,
  KbPublicArticle,
  KbPublicArticleDetail,
  CreateKbArticleInput,
  UpdateKbArticleInput,
  SupportAdminStats,
  SupportAgentRef,
  SupportAiAnalysis,
  SupportAskAiInput,
  SupportCustomerStats,
  SupportDeflectionResult,
  SupportTicketDetail,
  SupportTicketFilter,
  SupportTicketList,
} from '@archivato/shared';

export const API_URL =
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

  // Tolerate empty bodies (204 No Content, or a 200 with no JSON).
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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

  /** Set or clear a project's display name (empty string clears it). */
  rename: (sessionId: string, title: string) =>
    request<ProjectSummary>(`/interview/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

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

  explain: (sessionId: string, ref: DecisionRef) =>
    request<DecisionExplanation>(`/system-design/${sessionId}/explain`, {
      method: 'POST',
      body: JSON.stringify(ref),
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

export const threatModelApi = {
  generate: (sessionId: string) =>
    request<ThreatModel>(`/threat-model/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<ThreatModel>(`/threat-model/${sessionId}`),
};

export const qaPlanApi = {
  generate: (sessionId: string) =>
    request<QaPlan>(`/qa-plan/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) => request<QaPlan>(`/qa-plan/${sessionId}`),
};

export const costEstimateApi = {
  generate: (sessionId: string) =>
    request<CostEstimate>(`/cost-estimate/${sessionId}/generate`, {
      method: 'POST',
    }),

  get: (sessionId: string) =>
    request<CostEstimate>(`/cost-estimate/${sessionId}`),
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

/**
 * Like `request`, but returns the raw response as a Blob (for binary downloads,
 * e.g. the scaffold ZIP). Keeps the 401→refresh→retry behavior and throws a
 * typed `ApiError` (with server `code`) so callers can branch on 402/upgrade.
 */
async function requestBlob(path: string, allowRefresh = true): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (res.status === 401 && allowRefresh) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) return requestBlob(path, false);
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
  return res.blob();
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

  /** Set the profile picture (a base64 image data URI, resized client-side). */
  updateAvatar: (avatarUrl: string) =>
    request<AuthUser>('/auth/avatar', {
      method: 'PUT',
      body: JSON.stringify({ avatarUrl }),
    }),

  /** Remove the profile picture (the UI falls back to initials). */
  removeAvatar: () => request<AuthUser>('/auth/avatar', { method: 'DELETE' }),

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

export const notificationsApi = {
  /** Recent notifications + unread count (drives the bell). */
  list: () => request<NotificationsPage>('/notifications'),

  /** Mark all read; returns the refreshed page. */
  markAll: () =>
    request<NotificationsPage>('/notifications/read-all', { method: 'POST' }),

  /** Mark one notification read. */
  markRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
};

export const billingApi = {
  /** Public plan catalogue (pricing page). */
  plans: () => request<PlanInfo[]>('/billing/plans'),

  /** The signed-in user's subscription + quota usage. */
  subscription: () => request<SubscriptionView>('/billing'),

  /** Upgrade to Pro at the given cadence (mock activates instantly; Paddle returns checkout params). */
  checkout: (billingCycle: BillingCycle = 'monthly') =>
    request<CheckoutResponse>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ billingCycle }),
    }),

  /** Cancel Pro. */
  cancel: () => request<SubscriptionView>('/billing/cancel', { method: 'POST' }),
};

/** Billing-admin console (requires `billing:manage`). */
export const billingAdminApi = {
  /** KPIs + a filtered, paginated page of subscription records. */
  overview: (filter: BillingAdminFilter = {}) => {
    const p = new URLSearchParams();
    if (filter.page) p.set('page', String(filter.page));
    if (filter.pageSize) p.set('pageSize', String(filter.pageSize));
    if (filter.plan) p.set('plan', filter.plan);
    if (filter.status) p.set('status', filter.status);
    if (filter.q) p.set('q', filter.q);
    const qs = p.toString();
    return request<BillingAdminData>(`/billing/admin${qs ? `?${qs}` : ''}`);
  },
  /** 30-day new-Pro + churn trend series. */
  trends: () => request<BillingTrends>('/billing/admin/trends'),
  /** Full billing detail + event history for one customer. */
  detail: (userId: string) =>
    request<BillingSubscriptionDetail>(`/billing/admin/subscriptions/${userId}`),
  /** Comp a user to Pro. */
  grantPro: (userId: string) =>
    request<BillingSubscriptionDetail>(
      `/billing/admin/subscriptions/${userId}/grant-pro`,
      { method: 'POST' },
    ),
  /** Immediately downgrade a user to Free. */
  revoke: (userId: string) =>
    request<BillingSubscriptionDetail>(
      `/billing/admin/subscriptions/${userId}/revoke`,
      { method: 'POST' },
    ),
};

/** Marketing waitlist admin list (requires `admin:analytics`). */
export const waitlistAdminApi = {
  /** A filtered, paginated, newest-first page of signups. */
  list: (params: { q?: string; page?: number; pageSize?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.set('page', String(params.page));
    if (params.pageSize) p.set('pageSize', String(params.pageSize));
    if (params.q) p.set('q', params.q);
    const qs = p.toString();
    return request<WaitlistAdminPage>(`/waitlist/admin${qs ? `?${qs}` : ''}`);
  },
};

export const adminApi = {
  /** Headline KPIs + 30-day trend series. */
  stats: () => request<AdminStats>('/admin/stats'),
  /** Traffic detail (daily series + top pages/referrers). */
  traffic: () => request<AdminTraffic>('/admin/traffic'),
  /** LLM token spend (30d) — by stage, model, agent, heaviest users. */
  llmUsage: () => request<AdminLlmUsage>('/admin/llm-usage'),
  /** Paginated users with plan + project count. */
  users: (page = 1, pageSize = 20) =>
    request<AdminUsersPage>(`/admin/users?page=${page}&pageSize=${pageSize}`),
  /** Promote/demote a user. */
  setRole: (id: string, role: AccountRole) =>
    request<void>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  /** Delete a user (cascades their projects). */
  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};

/** RBAC role management (admin, requires `admin:roles:manage`). */
export const rolesApi = {
  list: () => request<RoleView[]>('/admin/roles'),
  create: (input: CreateRoleInput) =>
    request<RoleView>('/admin/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, patch: UpdateRoleInput) =>
    request<RoleView>(`/admin/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    request<void>(`/admin/roles/${id}`, { method: 'DELETE' }),
  /** Role ids currently assigned to a user. */
  userRoles: (userId: string) =>
    request<{ roleIds: string[] }>(`/admin/roles/user/${userId}`),
  /** Replace a user's whole role set. */
  setUserRoles: (userId: string, roleIds: string[]) =>
    request<void>(`/admin/roles/user/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    }),
  /** Provision a staff account; returns the generated password once. */
  provisionUser: (input: ProvisionUserInput) =>
    request<ProvisionedUser>('/admin/roles/provision-user', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

/**
 * Anonymous pageview beacon. Fire-and-forget (never throws) — used on the public
 * landing so admin traffic charts include non-signed-in visitors. `keepalive`
 * lets it complete even if the page is navigating away.
 *
 * The hard timeout matters: against a cold Render free instance (~50s wake) an
 * un-aborted request dangles for the whole wake-up, and any tool waiting for
 * network-idle (Lighthouse: "the page loaded too slowly to finish") counts the
 * page as still loading that entire time. A beacon that misses a sleeping
 * server is data we can afford to lose; a hanging request on the landing page
 * is not.
 */
export const analyticsApi = {
  track: (path: string, referrer?: string) => {
    try {
      void fetch(`${API_URL}/analytics/track`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        signal: AbortSignal.timeout(4000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, referrer: referrer || undefined }),
      }).catch(() => undefined);
    } catch {
      /* never let analytics break the page */
    }
  },
};

/** Public marketing waitlist signup (landing page). */
export const waitlistApi = {
  join: (input: WaitlistSignupInput) =>
    request<WaitlistSignupResult>('/waitlist', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

/** Build a query string from a support ticket filter (skips empty values). */
function supportQuery(filter: SupportTicketFilter = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && `${v}` !== '') params.set(k, `${v}`);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Customer Support Center — tickets, conversation, attachments, and AI. */
export const supportApi = {
  // Dashboard + Knowledge Base (public, published only)
  stats: () => request<SupportCustomerStats>('/support/stats'),
  kb: (q?: string) =>
    request<{ articles: KbPublicArticle[] }>(
      `/support/kb${q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
    ),
  kbArticle: (id: string) =>
    request<KbPublicArticleDetail>(`/support/kb/${id}`),

  // Tickets (customer scope)
  list: (filter?: SupportTicketFilter) =>
    request<SupportTicketList>(`/support/tickets${supportQuery(filter)}`),
  create: (input: CreateSupportTicketInput) =>
    request<SupportTicketDetail>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  get: (id: string) => request<SupportTicketDetail>(`/support/tickets/${id}`),
  reply: (id: string, body: string) =>
    request<SupportTicketDetail>(`/support/tickets/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  close: (id: string) =>
    request<SupportTicketDetail>(`/support/tickets/${id}/close`, {
      method: 'POST',
    }),
  reopen: (id: string) =>
    request<SupportTicketDetail>(`/support/tickets/${id}/reopen`, {
      method: 'POST',
    }),
  addAttachment: (
    id: string,
    input: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
      textContent?: string;
      messageId?: string;
    },
  ) =>
    request<SupportTicketDetail>(`/support/tickets/${id}/attachments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // AI assistant
  deflect: (input: SupportAskAiInput) =>
    request<SupportDeflectionResult>('/support/ai/deflect', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  analyze: (id: string) =>
    request<SupportAiAnalysis>(`/support/tickets/${id}/ai/analyze`, {
      method: 'POST',
    }),
};

/** Knowledge Base management (staff with `support:kb:manage`). */
export const kbAdminApi = {
  list: () => request<{ articles: KbArticleSummary[] }>('/support/admin/kb'),
  get: (id: string) => request<KbArticle>(`/support/admin/kb/${id}`),
  create: (input: CreateKbArticleInput) =>
    request<KbArticle>('/support/admin/kb', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, patch: UpdateKbArticleInput) =>
    request<KbArticle>(`/support/admin/kb/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    request<void>(`/support/admin/kb/${id}`, { method: 'DELETE' }),
};

/** Admin Support Panel — every ticket, assignment, notes, and AI copilot. */
export const supportAdminApi = {
  stats: () => request<SupportAdminStats>('/support/admin/stats'),
  agents: () => request<SupportAgentRef[]>('/support/admin/agents'),
  list: (filter?: SupportTicketFilter) =>
    request<SupportTicketList>(`/support/admin/tickets${supportQuery(filter)}`),
  get: (id: string) =>
    request<SupportTicketDetail>(`/support/admin/tickets/${id}`),
  update: (
    id: string,
    patch: {
      status?: string;
      priority?: string;
      category?: string;
      assigneeId?: string | null;
    },
  ) =>
    request<SupportTicketDetail>(`/support/admin/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  addNote: (id: string, body: string) =>
    request<SupportTicketDetail>(`/support/admin/tickets/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  copilot: (id: string) =>
    request<SupportAiAnalysis>(`/support/admin/tickets/${id}/ai/copilot`, {
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
  openapiYaml: (sessionId: string) =>
    requestText(`/export/${sessionId}/openapi.yaml`),
  structure: (sessionId: string) =>
    request<ProjectStructure>(`/export/${sessionId}/structure`),
  sql: (sessionId: string) => requestText(`/export/${sessionId}/schema.sql`),
  postman: (sessionId: string) =>
    request<Record<string, unknown>>(`/export/${sessionId}/postman`),
  /** Every format bundled into one .zip Blob. */
  all: (sessionId: string) => requestBlob(`/export/${sessionId}/all.zip`),
};

export const shareApi = {
  /** The session's public link, or null when it isn't shared. */
  get: (sessionId: string) => request<ShareLink | null>(`/share/${sessionId}`),

  /** Mint a public link (idempotent). Pro-gated — a 402 opens the upgrade modal. */
  create: (sessionId: string) =>
    request<ShareLink>(`/share/${sessionId}`, { method: 'POST' }),

  /** Revoke the link. The token dies permanently; re-sharing mints a new one. */
  revoke: (sessionId: string) =>
    request<void>(`/share/${sessionId}`, { method: 'DELETE' }),
};

/**
 * The outcome of resolving a share token. `missing` and `unavailable` are kept
 * apart on purpose: "the owner revoked this link" and "our API is asleep" are
 * different truths, and telling a visitor the first when the second is true
 * permanently kills a link that is actually fine.
 */
export type SharedProjectResult =
  | { status: 'ok'; project: SharedProject }
  | { status: 'missing' }
  | { status: 'unavailable' };

/** A cold Render free instance takes ~50s to wake; don't hang SSR waiting. */
const SHARE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Read a shared design by its public token — the one API call in this file that
 * is **unauthenticated**. It deliberately bypasses `request()`: that helper sends
 * cookies and retries a 401 through the refresh endpoint, neither of which makes
 * sense for a stranger following a link (and it runs during SSR, where there is
 * no session to refresh).
 *
 * It never throws. This runs inside a server component and `generateMetadata`,
 * where an unhandled rejection is a **500 error page** — the worst possible
 * outcome for the one page whose whole job is converting a stranger. A dead API
 * degrades to a "temporarily unavailable" page instead.
 */
export async function fetchSharedProject(
  token: string,
): Promise<SharedProjectResult> {
  try {
    const res = await fetch(`${API_URL}/shared/${encodeURIComponent(token)}`, {
      // Never serve a stale design (a revoked link must 404 immediately).
      cache: 'no-store',
      signal: AbortSignal.timeout(SHARE_FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unavailable' };
    return { status: 'ok', project: (await res.json()) as SharedProject };
  } catch {
    // Network error, DNS failure, or the timeout above.
    return { status: 'unavailable' };
  }
}

/** `?target=…`, omitted entirely when the caller wants the server's default. */
function targetQuery(target?: ScaffoldTarget): string {
  return target ? `?target=${target}` : '';
}

export const scaffoldApi = {
  /** File manifest (paths + contents) of the generated code. */
  manifest: (sessionId: string, target?: ScaffoldTarget) =>
    request<ScaffoldManifest>(`/scaffold/${sessionId}${targetQuery(target)}`),

  /** The scaffold as a downloadable .zip Blob. */
  zip: (sessionId: string, target?: ScaffoldTarget) =>
    requestBlob(`/scaffold/${sessionId}/zip${targetQuery(target)}`),

  /**
   * Create a GitHub repo and push the scaffold. Omit `token` to use the stored
   * OAuth connection; pass a PAT to use it once (never stored).
   */
  pushToGithub: (
    sessionId: string,
    input: {
      token?: string;
      repoName: string;
      isPrivate?: boolean;
      target?: ScaffoldTarget;
    },
  ) =>
    request<GithubPushResult>(`/scaffold/${sessionId}/github`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** The signed-in user's GitHub connection state (per-user, not per-session). */
  githubStatus: () =>
    request<GithubConnectionStatus>(`/scaffold/github/connection`),

  /** Full URL that begins the GitHub connect OAuth flow (opened in a popup). */
  githubConnectUrl: () => `${API_URL}/scaffold/github/connect/start`,

  /** The API origin — used to validate the connect popup's postMessage. */
  apiOrigin: () => new URL(API_URL).origin,

  /** Remove the stored GitHub connection. */
  disconnectGithub: () =>
    request<{ success: true }>(`/scaffold/github/connection`, {
      method: 'DELETE',
    }),
};
