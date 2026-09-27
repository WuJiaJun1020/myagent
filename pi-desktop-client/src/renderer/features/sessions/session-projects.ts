import type { SessionListItem } from "../../../shared/contracts/agent-session";

export function workspaceKey(cwd: string): string {
  const path = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(path) || path.startsWith("//") ? path.toLowerCase() : path;
}

export function groupSessionProjects(sessions: SessionListItem[], cwd: string, directories: string[] = []) {
  const projects = new Map<string, { key: string; name: string; cwd: string; current: boolean; sessions: SessionListItem[] }>();
  // Preserve saved project order; switching workspaces must only update the marker.
  for (const path of [...directories, ...(cwd ? [cwd] : [])]) {
    const key = workspaceKey(path);
    if (!projects.has(key)) projects.set(key, {
      key, name: path.split(/[\\/]/).filter(Boolean).at(-1) || path,
      cwd: path, current: key === workspaceKey(cwd), sessions: [],
    });
  }
  for (const session of [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt)) {
    if (session.mode !== "work") continue;
    const path = session.workspace?.cwd || (session.workspace?.current ? cwd : "");
    // Older cached entries without a path must not merge unrelated names.
    const key = path ? workspaceKey(path) : `unknown:${session.id}`;
    let project = projects.get(key);
    if (!project) {
      project = { key, name: session.workspace?.name || "未知工作区", cwd: path, current: key === workspaceKey(cwd), sessions: [] };
      projects.set(key, project);
    }
    project.sessions.push(session);
  }
  return [...projects.values()];
}
