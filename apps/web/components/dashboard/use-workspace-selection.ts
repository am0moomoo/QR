"use client";

import { useEffect, useState } from "react";
import {
  listDashboardFolders,
  listDashboardWorkspaces,
  type DashboardFolderListResponse,
  type DashboardWorkspaceListResponse
} from "../../lib/dashboard-api";
import type { RemoteState } from "./dashboard-types";
import {
  createInitialRemoteState,
  pickFolder,
  pickWorkspace,
  readSelectedWorkspaceId,
  writeSelectedFolderId,
  writeSelectedWorkspaceId
} from "./dashboard-utils";

export function useWorkspaceSelection({
  defaultWorkspaceId,
  token
}: {
  defaultWorkspaceId?: string | null;
  token: string;
}) {
  const [workspacesState, setWorkspacesState] =
    useState<RemoteState<DashboardWorkspaceListResponse>>(createInitialRemoteState);
  const [foldersState, setFoldersState] =
    useState<RemoteState<DashboardFolderListResponse>>(createInitialRemoteState);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [workspaceReloadNonce, setWorkspaceReloadNonce] = useState(0);
  const [folderReloadNonce, setFolderReloadNonce] = useState(0);

  useEffect(() => {
    if (!token) {
      setWorkspacesState({
        data: { items: [] },
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      setSelectedWorkspaceId("");
      return;
    }

    let isActive = true;

    setWorkspacesState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
      status: "loading"
    }));

    listDashboardWorkspaces(token)
      .then((response) => {
        if (!isActive) {
          return;
        }

        const selectedWorkspace =
          pickWorkspace(
            response.items,
            selectedWorkspaceId || readSelectedWorkspaceId() || defaultWorkspaceId
          ) ?? null;

        setWorkspacesState({
          data: response,
          errorMessage: null,
          errorRequestId: null,
          status: "ready"
        });

        if (selectedWorkspace) {
          writeSelectedWorkspaceId(selectedWorkspace.id);
          setSelectedWorkspaceId(selectedWorkspace.id);
          return;
        }

        setSelectedWorkspaceId("");
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setWorkspacesState({
          data: null,
          errorMessage: error instanceof Error ? error.message : "Could not load workspaces.",
          errorRequestId: "requestId" in (error as Record<string, unknown>)
            ? String((error as { requestId?: string | null }).requestId ?? "")
            : null,
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [defaultWorkspaceId, selectedWorkspaceId, token, workspaceReloadNonce]);

  useEffect(() => {
    if (!token) {
      setFoldersState({
        data: { items: [] },
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      setSelectedFolderId(null);
      return;
    }

    if (!selectedWorkspaceId) {
      setFoldersState({
        data: { items: [] },
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      setSelectedFolderId(null);
      return;
    }

    let isActive = true;

    setFoldersState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
      status: "loading"
    }));

    listDashboardFolders(token, selectedWorkspaceId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        const selectedFolder = pickFolder(
          response.items,
          selectedWorkspaceId,
          selectedFolderId
        );

        setFoldersState({
          data: response,
          errorMessage: null,
          errorRequestId: null,
          status: "ready"
        });
        setSelectedFolderId(selectedFolder?.id ?? null);
        writeSelectedFolderId(selectedWorkspaceId, selectedFolder?.id ?? null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setFoldersState({
          data: null,
          errorMessage: error instanceof Error ? error.message : "Could not load folders.",
          errorRequestId: "requestId" in (error as Record<string, unknown>)
            ? String((error as { requestId?: string | null }).requestId ?? "")
            : null,
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [folderReloadNonce, selectedFolderId, selectedWorkspaceId, token]);

  const workspaces = workspacesState.data?.items ?? [];
  const folders = foldersState.data?.items ?? [];
  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedFolder =
    folders.find((folder) => folder.id === selectedFolderId) ?? null;

  function chooseWorkspace(workspaceId: string) {
    writeSelectedWorkspaceId(workspaceId);
    setSelectedWorkspaceId(workspaceId);
    setSelectedFolderId(null);
    writeSelectedFolderId(workspaceId, null);
  }

  function chooseFolder(folderId: string | null) {
    setSelectedFolderId(folderId);

    if (selectedWorkspaceId) {
      writeSelectedFolderId(selectedWorkspaceId, folderId);
    }
  }

  return {
    chooseFolder,
    chooseWorkspace,
    folders,
    foldersState,
    refreshFolders: () => setFolderReloadNonce((value) => value + 1),
    refreshWorkspaces: () => setWorkspaceReloadNonce((value) => value + 1),
    selectedFolder,
    selectedFolderId,
    selectedWorkspace,
    selectedWorkspaceId: selectedWorkspace?.id ?? readSelectedWorkspaceId() ?? "",
    workspaces,
    workspacesState
  };
}
