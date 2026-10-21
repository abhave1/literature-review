export interface AdminSnapshot {
  users: { id: string; email: string | null; role: string | null }[];
  projects: { id: string; name: string }[];
  bots: { id: string; project_id: string; name: string; key: string }[];
  features: { id: string; code: string; name: string; description: string }[];
  projectFeatures: { id: string; project_id: string; feature_id: string; enabled: boolean }[];
  memberships: { user_id: string; project_id: string }[];
  grants: { user_id: string; project_id: string; bot_id: string }[];
  permissions: { user_id: string; project_id: string; project_feature_id: string; allowed: boolean }[];
}
