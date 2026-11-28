import { parseTwitchTimestamp, parseTwitchVideoUrl } from './twitch';

describe('parseTwitchTimestamp', () => {
  it('parses h/m/s and plain seconds', () => {
    expect(parseTwitchTimestamp('1h2m3s')).toBe(3723);
    expect(parseTwitchTimestamp('5m')).toBe(300);
    expect(parseTwitchTimestamp('90s')).toBe(90);
    expect(parseTwitchTimestamp('90')).toBe(90);
  });

  it('rejects empty or malformed values', () => {
    expect(parseTwitchTimestamp(null)).toBeUndefined();
    expect(parseTwitchTimestamp('')).toBeUndefined();
    expect(parseTwitchTimestamp('abc')).toBeUndefined();
  });
});

describe('parseTwitchVideoUrl', () => {
  it('parses VOD page URLs with and without a scheme', () => {
    expect(
      parseTwitchVideoUrl('https://www.twitch.tv/videos/123456?t=1m30s'),
    ).toEqual({ id: '123456', startSec: 90 });
    expect(parseTwitchVideoUrl('twitch.tv/videos/42')).toEqual({
      id: '42',
      startSec: undefined,
    });
  });

  it('parses player embed URLs', () => {
    expect(
      parseTwitchVideoUrl('https://player.twitch.tv/?video=v987&parent=x'),
    ).toEqual({ id: '987', startSec: undefined });
  });

  it('rejects non-Twitch hosts and non-VOD paths', () => {
    expect(
      parseTwitchVideoUrl('https://eviltwitch.tv/videos/1'),
    ).toBeUndefined();
    expect(
      parseTwitchVideoUrl('https://twitch.tv/somechannel'),
    ).toBeUndefined();
    expect(parseTwitchVideoUrl('not a url')).toBeUndefined();
  });
});
