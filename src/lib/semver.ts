/** Numeric parts of a SemVer version ("1.2.3", "v1.2.3-rc.1" → [1, 2, 3]); pre-release ignored. */
function parts(v: string): number[] {
  const core = v.trim().replace(/^v/, "").split(/[-+]/)[0] ?? "";
  return core.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : 0));
}

/** -1, 0 or 1 as a is older than, equal to or newer than b (major.minor.patch). */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
