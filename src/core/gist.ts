/**
 * GitHub Gist operations for sync storage
 * Uses private Gists for secure storage
 */

import { Octokit } from "@octokit/rest";

/**
 * Gist file content
 */
export interface GistFile {
  filename: string;
  content: string;
}

/**
 * Gist metadata
 */
export interface GistInfo {
  id: string;
  description: string;
  files: Record<string, { content: string }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a new private Gist
 */
export async function createGist(
  token: string,
  description: string,
  files: GistFile[]
): Promise<GistInfo> {
  const octokit = new Octokit({ auth: token });
  
  const gistFiles: Record<string, { content: string }> = {};
  for (const file of files) {
    gistFiles[file.filename] = { content: file.content };
  }
  
  const response = await octokit.gists.create({
    description,
    public: false,
    files: gistFiles,
  });
  
  const gist = response.data;
  
  return {
    id: gist.id!,
    description: gist.description || "",
    files: gist.files as Record<string, { content: string }>,
    createdAt: gist.created_at!,
    updatedAt: gist.updated_at!,
  };
}

/**
 * Get a Gist by ID
 */
export async function getGist(token: string, gistId: string): Promise<GistInfo> {
  const octokit = new Octokit({ auth: token });
  
  const response = await octokit.gists.get({ gist_id: gistId });
  const gist = response.data;
  
  const files: Record<string, { content: string }> = {};
  for (const [filename, file] of Object.entries(gist.files || {})) {
    if (file && file.content) {
      files[filename] = { content: file.content };
    }
  }
  
  return {
    id: gist.id!,
    description: gist.description || "",
    files,
    createdAt: gist.created_at!,
    updatedAt: gist.updated_at!,
  };
}

/**
 * Update a Gist
 */
export async function updateGist(
  token: string,
  gistId: string,
  description: string,
  files: GistFile[]
): Promise<GistInfo> {
  const octokit = new Octokit({ auth: token });
  
  const gistFiles: Record<string, { content: string | null }> = {};
  for (const file of files) {
    gistFiles[file.filename] = { content: file.content };
  }
  
  const response = await octokit.gists.update({
    gist_id: gistId,
    description,
    files: gistFiles as any,
  });
  
  const gist = response.data;
  
  return {
    id: gist.id!,
    description: gist.description || "",
    files: gist.files as Record<string, { content: string }>,
    createdAt: gist.created_at!,
    updatedAt: gist.updated_at!,
  };
}

/**
 * Delete a file from a Gist
 */
export async function deleteGistFile(
  token: string,
  gistId: string,
  filename: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  
  await octokit.gists.update({
    gist_id: gistId,
    files: {
      [filename]: null as any,
    },
  });
}

/**
 * List all sync Gists
 */
export async function listSyncGists(token: string): Promise<GistInfo[]> {
  const octokit = new Octokit({ auth: token });
  const response = await octokit.gists.list({ per_page: 100 });
  
  const syncGists: GistInfo[] = [];
  
  for (const gist of response.data) {
    if (gist.description?.includes("coding-agent-sync") || gist.description?.includes("opencodesync")) {
      syncGists.push({
        id: gist.id!,
        description: gist.description || "",
        files: gist.files as Record<string, { content: string }>,
        createdAt: gist.created_at!,
        updatedAt: gist.updated_at!,
      });
    }
  }
  
  return syncGists;
}

/**
 * Find the primary sync Gist (legacy support)
 */
export async function findSyncGist(token: string): Promise<GistInfo | null> {
  const gists = await listSyncGists(token);
  return gists.length > 0 ? gists[0] : null;
}

/**
 * Validate GitHub token
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: token });
    await octokit.users.getAuthenticated();
    await octokit.gists.list({ per_page: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get authenticated user info
 */
export async function getUser(token: string): Promise<{ login: string; name: string | null }> {
  const octokit = new Octokit({ auth: token });
  const response = await octokit.users.getAuthenticated();
  
  return {
    login: response.data.login,
    name: response.data.name,
  };
}
