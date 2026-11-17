import { BadGatewayException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FXRATES_API_BASE_CURRENCY,
  FXRATES_API_LATEST_URL,
  FXRATES_API_TIMEOUT_MS,
  FxRatesApiClient,
} from './fxrates-api.client.js';

describe('FxRatesApiClient', () => {
  const apiKey = 'test-secret-key';
  let client: FxRatesApiClient;
  let mockedFetch: ReturnType<typeof vi.fn>;
  let config: { get: ReturnType<typeof vi.fn> };

  const makeResponse = (payload: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  });

  const validPayload = () => ({
    success: true,
    base: 'USD',
    date: '2026-11-12T00:00:00.000Z',
    timestamp: 1_794_441_600,
    rates: { USD: 1, eur: 0.92, EGP: 49.5 },
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    config = { get: vi.fn().mockReturnValue(apiKey) };
    client = new FxRatesApiClient(config as unknown as ConfigService);
    mockedFetch = vi.fn();
    vi.stubGlobal('fetch', mockedFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests latest daily USD rates and returns a typed normalized snapshot', async () => {
    mockedFetch.mockResolvedValue(makeResponse(validPayload()));

    const result = await client.fetchLatestUsdDaily();
    const [request, options] = mockedFetch.mock.calls[0] as [URL, RequestInit];

    expect(request.origin + request.pathname).toBe(FXRATES_API_LATEST_URL);
    expect(request.searchParams.get('api_key')).toBe(apiKey);
    expect(request.searchParams.get('base')).toBe(FXRATES_API_BASE_CURRENCY);
    expect(request.searchParams.get('resolution')).toBe('1d');
    expect(request.searchParams.get('format')).toBe('json');
    expect(options.method).toBe('GET');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(FXRATES_API_TIMEOUT_MS).toBeGreaterThan(0);
    expect(result).toEqual({
      provider: 'FXRatesAPI',
      baseCurrency: 'USD',
      rateDate: '2026-11-12',
      providerTimestamp: new Date(1_794_441_600 * 1_000),
      rates: { USD: 1, EUR: 0.92, EGP: 49.5 },
    });
  });

  it('normalizes a provider timestamp with a non-UTC offset to the UTC calendar date', async () => {
    mockedFetch.mockResolvedValue(makeResponse({
      ...validPayload(),
      date: '2026-11-12T00:30:00+02:00',
    }));

    const result = await client.fetchLatestUsdDaily();

    expect(result.rateDate).toBe('2026-11-11');
  });

  it('passes the configured finite duration to AbortSignal.timeout', async () => {
    mockedFetch.mockResolvedValue(makeResponse(validPayload()));
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);

    await client.fetchLatestUsdDaily();

    expect(timeoutSpy).toHaveBeenCalledOnce();
    expect(timeoutSpy).toHaveBeenCalledWith(FXRATES_API_TIMEOUT_MS);
    expect(mockedFetch.mock.calls[0][1].signal).toBe(timeoutSignal);
  });

  it('rejects a missing API key without making a request', async () => {
    config.get.mockReturnValue(undefined);

    await expect(client.fetchLatestUsdDaily()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('rejects an unsuccessful HTTP response without exposing its body', async () => {
    mockedFetch.mockResolvedValue(makeResponse({ error: apiKey }, 401));

    await expect(client.fetchLatestUsdDaily()).rejects.toMatchObject({
      message: 'FX provider returned HTTP 401',
    });
    await expect(client.fetchLatestUsdDaily()).rejects.not.toThrow(apiKey);
  });

  it('turns request timeouts into sanitized gateway timeout errors', async () => {
    mockedFetch.mockRejectedValue(Object.assign(new Error(`timeout ${apiKey}`), { name: 'TimeoutError' }));

    await expect(client.fetchLatestUsdDaily()).rejects.toBeInstanceOf(GatewayTimeoutException);
    await expect(client.fetchLatestUsdDaily()).rejects.not.toThrow(apiKey);
  });

  it('sanitizes network errors that contain the credential-bearing URL', async () => {
    mockedFetch.mockRejectedValue(new Error(`request failed at ${FXRATES_API_LATEST_URL}?api_key=${apiKey}`));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(client.fetchLatestUsdDaily()).rejects.toMatchObject({
      message: 'FX provider request failed',
    });
    await expect(client.fetchLatestUsdDaily()).rejects.not.toThrow(apiKey);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without exposing provider response details', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error(`bad payload ${apiKey}`)),
    });

    await expect(client.fetchLatestUsdDaily()).rejects.toMatchObject({
      message: 'FX provider returned malformed JSON',
    });
    await expect(client.fetchLatestUsdDaily()).rejects.not.toThrow(apiKey);
  });

  it.each([
    null,
    [],
    {},
    { success: false, base: 'USD', date: '2026-11-12', rates: { USD: 1 } },
  ])('rejects malformed or unsuccessful payloads: %j', async (payload) => {
    mockedFetch.mockResolvedValue(makeResponse(payload));

    await expect(client.fetchLatestUsdDaily()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects an unexpected base currency', async () => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), base: 'EUR' }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('unexpected base currency');
  });

  it.each([
    undefined,
    null,
    'not-a-date',
    '2026-02-30',
    '2026-11-12T00:00:00',
  ])('rejects an invalid provider date: %j', async (date) => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), date }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('invalid rate date');
  });

  it.each([null, '1794427200', Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'rejects an invalid provider timestamp: %j',
    async (timestamp) => {
      mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), timestamp }));

      await expect(client.fetchLatestUsdDaily()).rejects.toThrow('invalid timestamp');
    },
  );

  it('accepts an omitted provider timestamp', async () => {
    const payload = validPayload();
    delete (payload as Partial<typeof payload>).timestamp;
    mockedFetch.mockResolvedValue(makeResponse(payload));

    const result = await client.fetchLatestUsdDaily();
    expect(result).not.toHaveProperty('providerTimestamp');
  });

  it.each([
    { 'US': 1 },
    { USDD: 1 },
    { 'U$D': 1 },
  ])('rejects invalid currency codes in the rates map: %j', async (rates) => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), rates }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('invalid currency code');
  });

  it.each([0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 'NaN'])('rejects invalid rates: %j', async (rate) => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), rates: { EUR: rate } }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('invalid rate');
  });

  it('rejects an empty rates object', async () => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), rates: {} }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('empty rates object');
  });

  it('rejects conflicting currency codes after case normalization', async () => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), rates: { eur: 0.9, EUR: 0.92 } }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('duplicate currency codes');
  });

  it('rejects a provider-supplied USD rate inconsistent with the requested base', async () => {
    mockedFetch.mockResolvedValue(makeResponse({ ...validPayload(), rates: { USD: 2, EUR: 0.92 } }));

    await expect(client.fetchLatestUsdDaily()).rejects.toThrow('invalid base rate');
  });
});
