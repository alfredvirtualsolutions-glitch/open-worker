import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";

const SEQUENZY_API_BASE = "https://api.sequenzy.com/api/v1";

interface SequenzyClient {
  apiKey: string;
}

let client: SequenzyClient | null = null;

function getClient(): SequenzyClient | null {
  if (!env.SEQUENZY_API_KEY) {
    logger.warn("SEQUENZY_API_KEY not set — Sequenzy integration disabled");
    return null;
  }
  if (!client) {
    client = { apiKey: env.SEQUENZY_API_KEY };
  }
  return client;
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const c = getClient();
  if (!c) throw new Error("Sequenzy not configured");

  const response = await fetch(`${SEQUENZY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    const error = (data as { error?: string }).error || `HTTP ${response.status}`;
    throw new Error(error);
  }
  return data as T;
}

export interface SendTransactionalEmailParams {
  to: string;
  slug: string;
  variables?: Record<string, unknown>;
}

export interface CreateSubscriberParams {
  email: string;
  firstName?: string;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
  enrollInSequences?: boolean;
}

export interface AddTagParams {
  email: string;
  tag: string;
}

export interface TriggerEventParams {
  email: string;
  event: string;
  properties?: Record<string, unknown>;
}

export async function sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("POST", "/transactional/send", params as unknown as Record<string, unknown>);
    return { success: true, data };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy transactional send failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function createSubscriber(params: CreateSubscriberParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("POST", "/subscribers", params as unknown as Record<string, unknown>);
    return { success: true, data };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy create subscriber failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function addTag(params: AddTagParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("POST", "/subscribers/tags", params as unknown as Record<string, unknown>);
    return { success: true, data };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy add tag failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function triggerEvent(params: TriggerEventParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("POST", "/subscribers/events", params as unknown as Record<string, unknown>);
    return { success: true, data };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy trigger event failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function getSubscriber(email: string): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("GET", `/subscribers/${encodeURIComponent(email)}`);
    return { success: true, data };
  } catch (err) {
    logger.error({ err, email }, "Sequenzy get subscriber failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function listSequences(): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const data = await request("GET", "/sequences");
    return { success: true, data };
  } catch (err) {
    logger.error({ err }, "Sequenzy list sequences failed");
    return { success: false, error: (err as Error).message };
  }
}

export function isSequenzyConfigured(): boolean {
  return !!env.SEQUENZY_API_KEY;
}