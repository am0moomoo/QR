import type { Request } from "express";

export type AuthenticatedUser = {
  defaultWorkspaceId: string | null;
  email: string;
  fullName: string | null;
  id: string;
  locale: string;
  avatarUrl: string | null;
};

export type AuthenticatedSession = {
  expiresAt: string;
  id: string;
};

export type AuthenticatedRequest = Request & {
  currentSession?: AuthenticatedSession;
  currentUser?: AuthenticatedUser;
};
