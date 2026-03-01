export declare const EXIT_POLICY: {
    readonly OK: 0;
    readonly FINDINGS: 1;
    readonly ERROR: 2;
    readonly RUNTIME: 3;
};
export type ExitCode = (typeof EXIT_POLICY)[keyof typeof EXIT_POLICY];
//# sourceMappingURL=exit-policy.d.ts.map