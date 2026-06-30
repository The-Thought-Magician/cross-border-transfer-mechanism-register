// All calls are relative to same-origin /api/proxy/<path>, which maps 1:1 to
// the backend /api/v1/<path>. The proxy route injects X-User-Id after
// resolving the Neon Auth session server-side.

type Query = Record<string, string | number | boolean | undefined | null>

function qs(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function http<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

function get<T = any>(path: string): Promise<T> {
  return http<T>(path)
}
function post<T = any>(path: string, body?: unknown): Promise<T> {
  return http<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function put<T = any>(path: string, body?: unknown): Promise<T> {
  return http<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function del<T = any>(path: string): Promise<T> {
  return http<T>(path, { method: 'DELETE' })
}

const api = {
  // Workspaces
  getMyWorkspaces: () => get('workspaces/mine'),
  getWorkspace: (id: string) => get(`workspaces/${id}`),
  createWorkspace: (data: any) => post('workspaces', data),
  updateWorkspace: (id: string, data: any) => put(`workspaces/${id}`, data),
  inviteMember: (id: string, data: any) => post(`workspaces/${id}/invite`, data),
  getWorkspaceMembers: (id: string) => get(`workspaces/${id}/members`),

  // Flows
  getFlows: (params?: Query) => get(`flows${qs(params)}`),
  getFlow: (id: string) => get(`flows/${id}`),
  createFlow: (data: any) => post('flows', data),
  updateFlow: (id: string, data: any) => put(`flows/${id}`, data),
  deleteFlow: (id: string) => del(`flows/${id}`),
  setFlowCategories: (id: string, data: any) => post(`flows/${id}/categories`, data),
  importFlows: (data: any) => post('flows/import', data),

  // Mechanisms
  getMechanisms: (params?: Query) => get(`mechanisms${qs(params)}`),
  getMechanism: (id: string) => get(`mechanisms/${id}`),
  createMechanism: (data: any) => post('mechanisms', data),
  updateMechanism: (id: string, data: any) => put(`mechanisms/${id}`, data),
  deleteMechanism: (id: string) => del(`mechanisms/${id}`),

  // SCC agreements
  getSccs: (params?: Query) => get(`scc${qs(params)}`),
  getScc: (id: string) => get(`scc/${id}`),
  getSccTracker: () => get('scc/tracker'),
  createScc: (data: any) => post('scc', data),
  updateScc: (id: string, data: any) => put(`scc/${id}`, data),
  deleteScc: (id: string) => del(`scc/${id}`),

  // TIAs
  getTias: (params?: Query) => get(`tias${qs(params)}`),
  getTia: (id: string) => get(`tias/${id}`),
  createTia: (data: any) => post('tias', data),
  updateTia: (id: string, data: any) => put(`tias/${id}`, data),
  updateTiaSteps: (id: string, data: any) => put(`tias/${id}/steps`, data),
  setTiaMeasures: (id: string, data: any) => post(`tias/${id}/measures`, data),
  approveTia: (id: string, data: any) => post(`tias/${id}/approve`, data),
  deleteTia: (id: string) => del(`tias/${id}`),

  // Adequacy
  getAdequacyEvents: (params?: Query) => get(`adequacy/events${qs(params)}`),
  createAdequacyEvent: (data: any) => post('adequacy/events', data),
  getAdequacyExposure: () => get('adequacy/exposure'),

  // Countries
  getCountries: (params?: Query) => get(`countries${qs(params)}`),
  getCountry: (id: string) => get(`countries/${id}`),
  createCountry: (data: any) => post('countries', data),
  updateCountry: (id: string, data: any) => put(`countries/${id}`, data),
  subscribeCountry: (id: string, data?: any) => post(`countries/${id}/subscribe`, data),
  unsubscribeCountry: (id: string) => del(`countries/${id}/subscribe`),

  // Recipients
  getRecipients: (params?: Query) => get(`recipients${qs(params)}`),
  getRecipient: (id: string) => get(`recipients/${id}`),
  createRecipient: (data: any) => post('recipients', data),
  updateRecipient: (id: string, data: any) => put(`recipients/${id}`, data),
  deleteRecipient: (id: string) => del(`recipients/${id}`),

  // Subprocessors
  getSubprocessors: (params?: Query) => get(`subprocessors${qs(params)}`),
  createSubprocessor: (data: any) => post('subprocessors', data),
  updateSubprocessor: (id: string, data: any) => put(`subprocessors/${id}`, data),
  deleteSubprocessor: (id: string) => del(`subprocessors/${id}`),

  // Onward transfers
  getOnward: (params?: Query) => get(`onward${qs(params)}`),
  getOnwardChains: () => get('onward/chains'),
  createOnward: (data: any) => post('onward', data),
  updateOnward: (id: string, data: any) => put(`onward/${id}`, data),
  deleteOnward: (id: string) => del(`onward/${id}`),

  // Coverage
  getCoverage: (params?: Query) => get(`coverage${qs(params)}`),
  recomputeCoverage: (data?: any) => post('coverage/recompute', data),
  getScorecard: () => get('coverage/scorecard'),

  // Gaps & tasks
  getGaps: (params?: Query) => get(`gaps${qs(params)}`),
  getTasks: (params?: Query) => get(`gaps/tasks${qs(params)}`),
  createTask: (data: any) => post('gaps/tasks', data),
  updateTask: (id: string, data: any) => put(`gaps/tasks/${id}`, data),
  generateTasks: (data?: any) => post('gaps/tasks/generate', data),

  // Reviews
  getReviews: (params?: Query) => get(`reviews${qs(params)}`),
  getReview: (id: string) => get(`reviews/${id}`),
  createReview: (data: any) => post('reviews', data),
  decideReview: (id: string, data: any) => put(`reviews/${id}`, data),

  // Data categories
  getDataCategories: (params?: Query) => get(`data-categories${qs(params)}`),
  createDataCategory: (data: any) => post('data-categories', data),
  updateDataCategory: (id: string, data: any) => put(`data-categories/${id}`, data),
  deleteDataCategory: (id: string) => del(`data-categories/${id}`),

  // Subject categories
  getSubjectCategories: (params?: Query) => get(`subject-categories${qs(params)}`),
  createSubjectCategory: (data: any) => post('subject-categories', data),
  updateSubjectCategory: (id: string, data: any) => put(`subject-categories/${id}`, data),
  deleteSubjectCategory: (id: string) => del(`subject-categories/${id}`),

  // Legal bases
  getLegalBases: (params?: Query) => get(`legal-bases${qs(params)}`),
  getLegalBasis: (id: string) => get(`legal-bases/${id}`),
  createLegalBasis: (data: any) => post('legal-bases', data),

  // Supplementary measures
  getMeasures: (params?: Query) => get(`measures${qs(params)}`),
  createMeasure: (data: any) => post('measures', data),
  updateMeasure: (id: string, data: any) => put(`measures/${id}`, data),
  deleteMeasure: (id: string) => del(`measures/${id}`),

  // Audit log
  getAuditLogs: (params?: Query) => get(`audit${qs(params)}`),
  createAuditLog: (data: any) => post('audit', data),

  // Notifications
  getNotifications: () => get('notifications'),
  markNotificationRead: (id: string) => put(`notifications/${id}/read`),
  markAllNotificationsRead: () => put('notifications/read-all'),

  // Reports
  getReports: (params?: Query) => get(`reports${qs(params)}`),
  getReport: (id: string) => get(`reports/${id}`),
  createReport: (data: any) => post('reports', data),
  exportAuditPack: (params?: Query) => get(`reports/export${qs(params)}`),

  // Dashboard
  getDashboard: () => get('dashboard'),

  // Settings
  getSettings: () => get('settings'),
  updateSettings: (data: any) => put('settings', data),

  // Seed
  seedSample: (data?: any) => post('seed/sample', data),

  // Billing
  getBillingPlan: () => get('billing/plan'),
  startCheckout: (data?: any) => post('billing/checkout', data),
  openBillingPortal: (data?: any) => post('billing/portal', data),
}

export default api
