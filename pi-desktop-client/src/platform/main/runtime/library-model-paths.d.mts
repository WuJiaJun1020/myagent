export type LibraryRuntimeLocations = { dataRoot: string; packaged?: boolean; resourcesPath?: string };
export type LibraryModelPaths = { pythonExe: string; serverScript: string; modelsDirectory: string; workingDirectory: string };
export function resolveLibraryModelPaths(options: LibraryRuntimeLocations & { appRoot: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform }): Promise<LibraryModelPaths>;
