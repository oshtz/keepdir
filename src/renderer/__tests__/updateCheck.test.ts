import { getLatestRelease, isNewerVersion } from '../updateCheck';

describe('updateCheck', () => {
  it('compares release tags against the current app version', () => {
    expect(isNewerVersion('v1.0.6', '1.0.5')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.0.5', '1.0.5')).toBe(false);
    expect(isNewerVersion('1.0.4', '1.0.5')).toBe(false);
    expect(isNewerVersion('not-a-version', '1.0.5')).toBe(false);
  });

  it('reads the latest GitHub release payload', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v1.2.3' }),
    });

    await expect(getLatestRelease(fetcher)).resolves.toEqual({
      version: '1.2.3',
    });
  });
});
