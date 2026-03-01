export const EXIT_POLICY = {
  OK: 0,
  FINDINGS: 1,
  ERROR: 2,
  RUNTIME: 3
} as const;

export type ExitCode = (typeof EXIT_POLICY)[keyof typeof EXIT_POLICY];
