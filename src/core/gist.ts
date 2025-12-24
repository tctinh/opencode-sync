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
  
  // Build files object with content
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
  
  const gistFiles: Record<string, { content: string }> = {};
  for (const file of files) {
    gistFiles[file.filename] = { content: file.content };
  }
  
  const response = await octokit.gists.update({
    gist_id: gistId,
    description,
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
      [filename]: null as unknown as { content: string },
    },
  });
}

/**
 * List user's Gists to find existing sync Gist
 */
export async function findSyncGist(token: string): Promise<GistInfo | null> {
  const octokit = new Octokit({ auth: token });
  
  const response = await octokit.gists.list({ per_page: 100 });
  
  for (const gist of response.data) {
    if (gist.description?.includes("opencodesync")) {
      const files: Record<string, { content: string }> = {};
      for (const [filename, file] of Object.entries(gist.files || {})) {
        if (file) {
          // Need to fetch full content
          const fullGist = await getGist(token, gist.id!);
          return fullGist;
        }
        files[filename] = { content: "" };
      }
      
      return {
        id: gist.id!,
        description: gist.description || "",
        files,
        createdAt: gist.created_at!,
        updatedAt: gist.updated_at!,
      };
    }
  }
  
  return null;
}

/**
 * Validate GitHub token has gist scope
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.users.getAuthenticated();
    
    // Check if we can access gists by listing them
    await octokit.gists.list({ per_page: 1 });
    
    return !!response.data.login;
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
