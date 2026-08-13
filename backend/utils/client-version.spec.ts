import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MINIMUM_CLIENT_VERSION,
  compareVersions,
  isClientTooOld,
  minimumClientVersion,
  parseVersion
} from './client-version';

describe('parseVersion', () => {
  it('parses a full version', () => {
    expect(parseVersion('1.2.3')).toEqual({ core: [1, 2, 3], prerelease: [] });
  });

  it('pads a partial version', () => {
    expect(parseVersion('0.6')).toEqual({ core: [0, 6, 0], prerelease: [] });
    expect(parseVersion('2')).toEqual({ core: [2, 0, 0], prerelease: [] });
  });

  it('tolerates a leading v and surrounding whitespace', () => {
    expect(parseVersion(' v1.0.0 ')).toEqual({ core: [1, 0, 0], prerelease: [] });
  });

  it('keeps prerelease identifiers and drops build metadata', () => {
    expect(parseVersion('0.6.0-beta.1+abc123')).toEqual({ core: [0, 6, 0], prerelease: ['beta', '1'] });
  });

  it('rejects anything it cannot read as a version', () => {
    for (const value of ['', '   ', 'latest', '1.2.3.4', '1.two.3', '0.6.0-', null, undefined]) {
      expect(parseVersion(value as string)).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.6.0', '0.7.0')).toBe(-1);
    expect(compareVersions('0.6.1', '0.6.0')).toBe(1);
    expect(compareVersions('0.6.0', '0.6.0')).toBe(0);
  });

  it('compares numerically, not as strings', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('treats a missing patch as zero', () => {
    expect(compareVersions('0.6', '0.6.0')).toBe(0);
  });

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+aaa', '1.0.0+zzz')).toBe(0);
  });

  it('ranks a prerelease below its release', () => {
    expect(compareVersions('0.6.0-beta.1', '0.6.0')).toBe(-1);
    expect(compareVersions('0.6.0', '0.6.0-beta.1')).toBe(1);
    expect(compareVersions('0.6.0-beta.1', '0.6.0-beta.2')).toBe(-1);
    expect(compareVersions('0.6.0-beta', '0.6.0-beta.1')).toBe(-1);
    expect(compareVersions('0.6.0-alpha', '0.6.0-beta')).toBe(-1);
    // Numeric identifiers rank below alphanumeric ones.
    expect(compareVersions('0.6.0-1', '0.6.0-alpha')).toBe(-1);
  });

  it('throws rather than guessing at nonsense', () => {
    expect(() => compareVersions('nonsense', '1.0.0')).toThrow();
    expect(() => compareVersions('1.0.0', 'nonsense')).toThrow();
  });
});

describe('isClientTooOld', () => {
  it('rejects a client older than the minimum', () => {
    expect(isClientTooOld('0.5.0', '0.6.0')).toBe(true);
  });

  it('accepts a client on exactly the minimum', () => {
    expect(isClientTooOld('0.6.0', '0.6.0')).toBe(false);
  });

  // The whole point of comparing rather than matching: whichever of web and backend deploys
  // first must not lock the other one out.
  it('accepts a client newer than the minimum', () => {
    expect(isClientTooOld('0.7.0', '0.6.0')).toBe(false);
    expect(isClientTooOld('1.0.0', '0.6.0')).toBe(false);
    expect(isClientTooOld('0.6.1', '0.6.0')).toBe(false);
  });

  it('rejects a client that sends no version at all', () => {
    expect(isClientTooOld(undefined, '0.6.0')).toBe(true);
    expect(isClientTooOld(null, '0.6.0')).toBe(true);
    expect(isClientTooOld('', '0.6.0')).toBe(true);
  });

  it('rejects a version it cannot parse', () => {
    expect(isClientTooOld('not-a-version', '0.6.0')).toBe(true);
  });

  it('rejects a prerelease of the minimum, and accepts a prerelease of a later version', () => {
    expect(isClientTooOld('0.6.0-beta.1', '0.6.0')).toBe(true);
    expect(isClientTooOld('0.7.0-beta.1', '0.6.0')).toBe(false);
  });
});

describe('minimumClientVersion', () => {
  const original = process.env.MIN_CLIENT_VERSION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MIN_CLIENT_VERSION;
    } else {
      process.env.MIN_CLIENT_VERSION = original;
    }
  });

  it('defaults when unset or blank', () => {
    delete process.env.MIN_CLIENT_VERSION;
    expect(minimumClientVersion()).toBe(DEFAULT_MINIMUM_CLIENT_VERSION);

    process.env.MIN_CLIENT_VERSION = '   ';
    expect(minimumClientVersion()).toBe(DEFAULT_MINIMUM_CLIENT_VERSION);
  });

  it('uses the configured value', () => {
    process.env.MIN_CLIENT_VERSION = '0.7.0';
    expect(minimumClientVersion()).toBe('0.7.0');
  });

  // Falling back to the default here would fail open in the one situation the variable exists
  // for — raising the floor mid-rollout — so a typo has to stop the API starting instead.
  it('throws when the configured value is not a version', () => {
    process.env.MIN_CLIENT_VERSION = 'latest';
    expect(() => minimumClientVersion()).toThrow('MIN_CLIENT_VERSION is not a version: latest');
  });
});
