import { describeFunctionError } from "./functionErrors";
import { invokeEdgeFunction } from "./functionAuth";
import { supabase } from "./supabaseClient";

export type EnterpriseRole = "owner" | "admin" | "member" | "viewer";
export type EnterpriseAssignmentStatus = "open" | "done";

export interface EnterpriseOrganization {
  id: string;
  name: string;
  plan: string;
  joinKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseMember {
  id: string;
  organizationId: string;
  userId: string;
  role: EnterpriseRole;
  fullName: string;
  email: string;
  avatarUrl?: string;
}

export interface EnterpriseChatMessage {
  id: string;
  organizationId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseAssignment {
  id: string;
  organizationId: string;
  sourceChatMessageId?: string;
  createdBy?: string;
  assignedToUserId?: string;
  assignedToLabel: string;
  title: string;
  detail: string;
  startAt: string;
  endAt: string;
  status: EnterpriseAssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseWorkspaceResult {
  ok: boolean;
  message: string;
  organizations: EnterpriseOrganization[];
  members: EnterpriseMember[];
}

export interface EnterpriseConversationResult {
  ok: boolean;
  message: string;
  messages: EnterpriseChatMessage[];
  assignments: EnterpriseAssignment[];
}

export interface EnterpriseMutationResult<T> {
  ok: boolean;
  message: string;
  data?: T;
}

export async function loadEnterpriseWorkspace(): Promise<EnterpriseWorkspaceResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before loading enterprise workspaces.",
      organizations: [],
      members: [],
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      ok: false,
      message: "Sign in before loading enterprise workspaces.",
      organizations: [],
      members: [],
    };
  }

  const membershipResult = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (membershipResult.error) {
    return {
      ok: false,
      message: membershipResult.error.message,
      organizations: [],
      members: [],
    };
  }

  const ownedMemberships = membershipResult.data ?? [];
  if (ownedMemberships.length === 0) {
    return {
      ok: true,
      message: "Create an enterprise or join one with a team key.",
      organizations: [],
      members: [],
    };
  }

  const organizationIds = uniqueStrings(
    ownedMemberships.map((membership) => String(membership.organization_id ?? "")),
  );

  const [organizationsResult, allMembersResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, plan, join_key, created_by, created_at, updated_at")
      .in("id", organizationIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("organization_memberships")
      .select("id, organization_id, user_id, role, created_at")
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: true }),
  ]);

  if (organizationsResult.error) {
    return {
      ok: false,
      message: organizationsResult.error.message,
      organizations: [],
      members: [],
    };
  }
  if (allMembersResult.error) {
    return {
      ok: false,
      message: allMembersResult.error.message,
      organizations: [],
      members: [],
    };
  }

  const memberRows = allMembersResult.data ?? [];
  const memberIds = uniqueStrings(memberRows.map((membership) => String(membership.user_id ?? "")));
  const profilesResult = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", memberIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    return {
      ok: false,
      message: profilesResult.error.message,
      organizations: [],
      members: [],
    };
  }

  const profileById = new Map(
    (profilesResult.data ?? []).map((profile: any) => [
      String(profile.id ?? ""),
      {
        email: String(profile.email ?? ""),
        fullName: String(profile.full_name ?? ""),
        avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : undefined,
      },
    ]),
  );

  return {
    ok: true,
    message: "Enterprise workspace loaded.",
    organizations: (organizationsResult.data ?? []).map(mapOrganization),
    members: memberRows.map((membership: any) =>
      mapMember(membership, profileById.get(String(membership.user_id ?? ""))),
    ),
  };
}

export async function loadEnterpriseConversation(
  organizationId: string,
): Promise<EnterpriseConversationResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before loading enterprise chat.",
      messages: [],
      assignments: [],
    };
  }

  const [messagesResult, assignmentsResult] = await Promise.all([
    supabase
      .from("enterprise_chat_messages")
      .select("id, organization_id, user_id, sender_name, body, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(80),
    supabase
      .from("enterprise_assignments")
      .select(
        "id, organization_id, source_chat_message_id, created_by, assigned_to_user_id, assigned_to_label, title, detail, start_at, end_at, status, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("start_at", { ascending: true })
      .limit(80),
  ]);

  if (messagesResult.error) {
    return {
      ok: false,
      message: messagesResult.error.message,
      messages: [],
      assignments: [],
    };
  }
  if (assignmentsResult.error) {
    return {
      ok: false,
      message: assignmentsResult.error.message,
      messages: [],
      assignments: [],
    };
  }

  return {
    ok: true,
    message: "Enterprise conversation loaded.",
    messages: (messagesResult.data ?? []).map(mapMessage),
    assignments: (assignmentsResult.data ?? []).map(mapAssignment),
  };
}

export async function createEnterpriseOrganization(
  name: string,
): Promise<EnterpriseMutationResult<EnterpriseOrganization>> {
  if (!supabase) {
    return { ok: false, message: "Add Supabase env vars before creating an enterprise." };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, message: "Enter a name for the enterprise." };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Sign in before creating an enterprise." };
  }

  const result = await supabase
    .from("organizations")
    .insert({ name: trimmedName, created_by: user.id, plan: "enterprise" })
    .select("id, name, plan, join_key, created_by, created_at, updated_at")
    .single();

  if (result.error || !result.data) {
    return { ok: false, message: result.error?.message ?? "Could not create the enterprise." };
  }

  return {
    ok: true,
    message: "Enterprise created.",
    data: mapOrganization(result.data),
  };
}

export async function joinEnterpriseWithKey(
  joinKey: string,
): Promise<EnterpriseMutationResult<EnterpriseOrganization>> {
  if (!supabase) {
    return { ok: false, message: "Add Supabase env vars before joining an enterprise." };
  }

  const normalizedJoinKey = joinKey.trim().toUpperCase();
  if (!normalizedJoinKey) {
    return { ok: false, message: "Enter an enterprise key." };
  }

  const { data, error } = await invokeEdgeFunction<{
    message?: string;
    organization?: unknown;
  }>("join-enterprise", {
    body: { joinKey: normalizedJoinKey },
  });

  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(error, "Joining the enterprise failed."),
    };
  }

  return {
    ok: true,
    message: String(data?.message ?? "Joined the enterprise."),
    data: data?.organization ? mapOrganization(data.organization) : undefined,
  };
}

export async function sendEnterpriseMessage(input: {
  organizationId: string;
  body: string;
  senderName?: string;
}): Promise<EnterpriseMutationResult<EnterpriseChatMessage>> {
  if (!supabase) {
    return { ok: false, message: "Add Supabase env vars before sending enterprise chat." };
  }

  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    return { ok: false, message: "Write a message before sending it to the enterprise chat." };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Sign in before sending enterprise chat." };
  }

  const profileResult = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const senderName =
    input.senderName?.trim() ||
    String(profileResult.data?.full_name ?? "").trim() ||
    String(profileResult.data?.email ?? user.email ?? "Team member").trim();

  const result = await supabase
    .from("enterprise_chat_messages")
    .insert({
      organization_id: input.organizationId,
      user_id: user.id,
      sender_name: senderName,
      body: trimmedBody,
    })
    .select("id, organization_id, user_id, sender_name, body, created_at, updated_at")
    .single();

  if (result.error || !result.data) {
    return { ok: false, message: result.error?.message ?? "Could not send the chat message." };
  }

  return {
    ok: true,
    message: "Enterprise chat updated.",
    data: mapMessage(result.data),
  };
}

export async function analyzeEnterpriseChat(input: {
  organizationId: string;
  messageId: string;
  timezone: string;
  messages: Array<{
    id: string;
    senderName: string;
    body: string;
    createdAt: string;
  }>;
}): Promise<EnterpriseMutationResult<EnterpriseAssignment[]>> {
  if (!supabase) {
    return { ok: false, message: "Add Supabase env vars before running the enterprise assistant." };
  }

  const { data, error } = await invokeEdgeFunction<{
    message?: string;
    assignments?: unknown[];
  }>("enterprise-chat-assistant", {
    body: input,
  });

  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(error, "Enterprise assistant failed."),
    };
  }

  return {
    ok: true,
    message: String(data?.message ?? "Enterprise assistant finished."),
    data: Array.isArray(data?.assignments)
      ? data.assignments.map((assignment: any) => mapAssignment(assignment))
      : [],
  };
}

export async function updateEnterpriseAssignmentStatus(input: {
  assignmentId: string;
  status: EnterpriseAssignmentStatus;
}): Promise<EnterpriseMutationResult<EnterpriseAssignment>> {
  if (!supabase) {
    return { ok: false, message: "Add Supabase env vars before updating enterprise assignments." };
  }

  const result = await supabase
    .from("enterprise_assignments")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.assignmentId)
    .select(
      "id, organization_id, source_chat_message_id, created_by, assigned_to_user_id, assigned_to_label, title, detail, start_at, end_at, status, created_at, updated_at",
    )
    .single();

  if (result.error || !result.data) {
    return {
      ok: false,
      message: result.error?.message ?? "Could not update enterprise assignment status.",
    };
  }

  return {
    ok: true,
    message: input.status === "done" ? "Assignment marked done." : "Assignment updated.",
    data: mapAssignment(result.data),
  };
}

function mapOrganization(row: any): EnterpriseOrganization {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Enterprise"),
    plan: String(row.plan ?? "enterprise"),
    joinKey: String(row.join_key ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapMember(
  row: any,
  profile: { email: string; fullName: string; avatarUrl?: string } | undefined,
): EnterpriseMember {
  const fallbackEmail = String(profile?.email ?? "");
  const fallbackName = String(profile?.fullName ?? "").trim() || fallbackEmail || "Team member";
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    userId: String(row.user_id ?? ""),
    role: normalizeRole(row.role),
    fullName: fallbackName,
    email: fallbackEmail,
    avatarUrl: profile?.avatarUrl,
  };
}

function mapMessage(row: any): EnterpriseChatMessage {
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    userId: String(row.user_id ?? ""),
    senderName: String(row.sender_name ?? "Team member"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapAssignment(row: any): EnterpriseAssignment {
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    sourceChatMessageId: optionalString(row.source_chat_message_id),
    createdBy: optionalString(row.created_by),
    assignedToUserId: optionalString(row.assigned_to_user_id),
    assignedToLabel: String(row.assigned_to_label ?? "Unassigned"),
    title: String(row.title ?? "Follow up"),
    detail: String(row.detail ?? ""),
    startAt: String(row.start_at ?? new Date().toISOString()),
    endAt: String(row.end_at ?? new Date(Date.now() + 3_600_000).toISOString()),
    status: row.status === "done" ? "done" : "open",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function normalizeRole(value: unknown): EnterpriseRole {
  return value === "owner" || value === "admin" || value === "viewer" ? value : "member";
}

function optionalString(value: unknown): string | undefined {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || undefined;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
