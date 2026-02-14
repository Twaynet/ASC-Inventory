/**
 * Auth API module
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: string;
    roles: string[];
    facilityId: string;
    facilityName: string;
    demoExpiresAt?: string | null;
  };
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod request + response schema
export async function login(facilityKey: string, username: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', { method: 'POST', body: { facilityKey, username, password } });
}

// TODO(api-schema): needs Zod response schema
export async function getMe(token: string): Promise<{ user: LoginResponse['user'] }> {
  return request('/auth/me', { token });
}

export async function logout(token: string): Promise<{ success: boolean }> {
  return request('/auth/logout', { method: 'POST', token });
}
