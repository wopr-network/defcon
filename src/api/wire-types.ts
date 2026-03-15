/**
 * Wire types for holyship HTTP API responses.
 * Uses snake_case to match the REST API contract.
 */

export interface ClaimResponse {
  entityId?: string;
  invocationId?: string;
  flowName?: string;
  stage?: string;
  refs?: Record<string, unknown> | null;
  artifacts?: Record<string, unknown> | null;
  prompt?: string;
  next_action?: string;
  retry_after_ms?: number;
  message?: string;
  worker_id?: string;
  entity_id?: string;
  invocation_id?: string;
  flow_name?: string;
  [key: string]: unknown;
}

export interface ReportResponse {
  newState?: string | null;
  new_state?: string | null;
  gatesPassed?: string[];
  gated?: boolean;
  gateTimedOut?: boolean;
  next_action?: string;
  retry_after_ms?: number;
  message?: string;
  timeout_prompt?: string;
  [key: string]: unknown;
}

export interface CreateEntityResponse {
  id: string;
  state: string;
  flowName: string;
}
