export type TerminalProfile = {
  id: string;
  name: string;
};

export type TerminalCreateRequest = {
  cwd: string;
  cols: number;
  rows: number;
  profileId?: string;
};

export type TerminalSession = {
  id: string;
  pid: number;
  cwd: string;
  profile: TerminalProfile;
};

export type TerminalDataEvent = {
  id: string;
  data: string;
};

export type TerminalExitEvent = {
  id: string;
  exitCode: number;
  signal?: number;
};
