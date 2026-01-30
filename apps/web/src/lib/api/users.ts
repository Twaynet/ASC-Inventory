/**
 * Users API module
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: string;
  roles: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  email?: string;
  name: string;
  role?: string;
  roles?: string[];
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string | null;
  name?: string;
  role?: string;
  roles?: string[];
  password?: string;
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getUsers(token: string, includeInactive = false): Promise<{ users: User[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return request(`/users${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getUser(token: string, userId: string): Promise<{ user: User }> {
  return request(`/users/${userId}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createUser(token: string, data: CreateUserRequest): Promise<{ user: User }> {
  return request('/users', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateUser(token: string, userId: string, data: UpdateUserRequest): Promise<{ user: User }> {
  return request(`/users/${userId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deactivateUser(token: string, userId: string): Promise<{ success: boolean }> {
  return request(`/users/${userId}/deactivate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function activateUser(token: string, userId: string): Promise<{ success: boolean }> {
  return request(`/users/${userId}/activate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod response schema
export async function getSurgeons(token: string): Promise<{ users: User[] }> {
  return request('/users/surgeons', { token });
}
