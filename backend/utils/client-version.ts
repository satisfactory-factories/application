// The client version gate. Kept pure and away from Express so it can be unit tested — see
// client-version.spec.ts. Issue #166: a browser tab left open across a release must not be able
// to overwrite an account's plan with a payload shape it no longer understands.

// Header the planner sends its build version on. Express lower-cases header names.
export const CLIENT_VERSION_HEADER = 'x-planner-version';

// Set on responses to a client below the minimum, so reads can warn without failing.
export const CLIENT_OUTDATED_HEADER = 'X-Planner-Client-Outdated';

// Machine-readable body code on a refused write, so a client can tell this apart from a
// validation error or an outage.
export const CLIENT_TOO_OLD_CODE = 'CLIENT_TOO_OLD';

// The release that first sends the header and first saves the whole tab. Anything older either
// sends no header at all or a version below this, and both must be refused a write.
export const DEFAULT_MINIMUM_CLIENT_VERSION = '0.6.0';

interface ParsedVersion {
  core: number[];
  prerelease: string[];
}

// Accepts `1.2.3`, `v1.2`, `0.6.0-beta.1`, `1.0.0+build`. Anything else is null, which callers
// treat as "too old" rather than guessing.
export const parseVersion = (value: string | null | undefined): ParsedVersion | null => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().replace(/^v/i, '');
  if (trimmed === '') return null;

  // Build metadata is explicitly not part of precedence.
  const withoutBuild = trimmed.split('+')[0];
  const separator = withoutBuild.indexOf('-');
  const coreText = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
  const prereleaseText = separator === -1 ? '' : withoutBuild.slice(separator + 1);

  const parts = coreText.split('.');
  if (parts.length === 0 || parts.length > 3) return null;

  const core: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    core.push(Number(part));
  }
  while (core.length < 3) core.push(0);

  if (prereleaseText === '' && separator !== -1) return null;

  return {
    core,
    prerelease: prereleaseText === '' ? [] : prereleaseText.split('.')
  };
};

const comparePrerelease = (a: string[], b: string[]): number => {
  // A release outranks any prerelease of the same core version.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];
    // Fewer identifiers, all else equal, is the lower precedence.
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftIsNumeric = /^\d+$/.test(left);
    const rightIsNumeric = /^\d+$/.test(right);
    if (leftIsNumeric && rightIsNumeric) return Number(left) < Number(right) ? -1 : 1;
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;
    return left < right ? -1 : 1;
  }

  return 0;
};

// -1 when a is older than b, 1 when newer, 0 when equal. Throws on anything unparseable so a
// typo in the configured minimum is loud rather than silently permissive.
export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left) throw new Error(`Unparseable version: ${a}`);
  if (!right) throw new Error(`Unparseable version: ${b}`);

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
};

// Strictly older only. A client *newer* than the server expects must pass, or whichever side
// deploys first locks the other one out.
export const isClientTooOld = (received: string | null | undefined, minimum: string): boolean => {
  // No header means a build from before the gate existed, which is by definition too old.
  if (!parseVersion(received)) return true;

  return compareVersions(received as string, minimum) < 0;
};

// Read per request rather than at boot, so the API's minimum can be raised by restarting the
// container with a new value instead of rebuilding the image.
export const minimumClientVersion = (): string => {
  const configured = process.env.MIN_CLIENT_VERSION?.trim();
  if (!configured) return DEFAULT_MINIMUM_CLIENT_VERSION;

  if (!parseVersion(configured)) {
    console.warn(`MIN_CLIENT_VERSION is not a version (${configured}); falling back to ${DEFAULT_MINIMUM_CLIENT_VERSION}.`);
    return DEFAULT_MINIMUM_CLIENT_VERSION;
  }

  return configured;
};
