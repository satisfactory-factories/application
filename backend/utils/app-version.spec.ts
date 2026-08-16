import fs from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { UNKNOWN_VERSION, appVersion, resetAppVersionCache } from './app-version';

afterEach(() => {
  resetAppVersionCache();
  delete process.env.APP_VERSION;
  vi.restoreAllMocks();
});

describe('appVersion', () => {
  it('prefers APP_VERSION when it is set', () => {
    process.env.APP_VERSION = ' 9.9.9 ';
    const read = vi.spyOn(fs, 'readFileSync');

    expect(appVersion()).toBe('9.9.9');
    expect(read).not.toHaveBeenCalled();
  });

  it('ignores an empty APP_VERSION and falls back to the file', () => {
    process.env.APP_VERSION = '   ';
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ version: '1.2.3' }));

    expect(appVersion()).toBe('1.2.3');
  });

  it('reads the version from the repo root package.json', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ version: '0.6.0' }));

    expect(appVersion()).toBe('0.6.0');
  });

  it('reads the file once and caches the result', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ version: '0.6.0' }));

    appVersion();
    appVersion();

    expect(read).toHaveBeenCalledTimes(1);
  });

  // The API must still boot: a version it cannot establish is not a reason to refuse to serve.
  it('reports unknown when the file is missing', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(appVersion()).toBe(UNKNOWN_VERSION);
  });

  it('reports unknown when the file has no usable version', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    for (const contents of ['{}', '{"version": ""}', '{"version": 6}', 'not json']) {
      resetAppVersionCache();
      vi.spyOn(fs, 'readFileSync').mockReturnValue(contents);
      expect(appVersion()).toBe(UNKNOWN_VERSION);
    }
  });
});
