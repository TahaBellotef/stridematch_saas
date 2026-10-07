import { buildApiUrl } from "@/shared/api/client";

export interface AdminUser {
  id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminUsersResponse {
  total: number;
  users: AdminUser[];
}

export async function fetchAdminUsers(
  token: string
): Promise<AdminUsersResponse> {
  const response = await fetch(buildApiUrl("/api/admin/users"), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch users (${response.status})`);
  }

  return response.json();
}
