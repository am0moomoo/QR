import type { Request } from "express";

export type AuthenticatedUser = {
  email: string;
  fullName: string | null;
  id: string;
  locale: string;
};

export type AuthenticatedSession = {
  expiresAt: string;
  id: string;
};

export type AuthenticatedRequest = Request & {
  currentSession?: AuthenticatedSession;
  currentUser?: AuthenticatedUser;
};
