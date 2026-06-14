const mockHset = jest.fn()
const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 0)

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => ({
    hset: mockHset
  }))
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: jest.fn(() => null),
  getProxyDescription: jest.fn(() => 'none')
}))

jest.mock(
  '../config/config',
  () => ({
    requestTimeout: 1000
  }),
  { virtual: true }
)

const openaiAccountService = require('../src/services/account/openaiAccountService')

describe('OpenAI Codex usage helpers', () => {
  afterAll(() => {
    setIntervalSpy.mockRestore()
  })

  beforeEach(() => {
    mockHset.mockClear()
  })

  it('reads reset credits from snake_case usage payloads', () => {
    const count = openaiAccountService.extractCodexRateLimitResetCreditsAvailableCount({
      rate_limit_reset_credits: {
        available_count: '3'
      }
    })

    expect(count).toBe(3)
  })

  it('reads reset credits from camelCase usage payloads', () => {
    const count = openaiAccountService.extractCodexRateLimitResetCreditsAvailableCount({
      rateLimitResetCredits: {
        availableCount: 2
      }
    })

    expect(count).toBe(2)
  })

  it('builds a snapshot from Codex usage payload windows and reset credits', () => {
    const snapshot = openaiAccountService.extractCodexUsageSnapshotFromPayload({
      rate_limit: {
        used_percent: '12.5',
        reset_after_seconds: '3600',
        window_minutes: 300
      },
      codeReviewRateLimit: {
        usedPercent: 20,
        resetAfterSeconds: 86400,
        windowMinutes: '10080'
      },
      rate_limit_reset_credits: {
        available_count: '1'
      }
    })

    expect(snapshot).toEqual({
      rateLimitResetCreditsAvailableCount: 1,
      primaryUsedPercent: 12.5,
      primaryResetAfterSeconds: 3600,
      primaryWindowMinutes: 300,
      secondaryUsedPercent: 20,
      secondaryResetAfterSeconds: 86400,
      secondaryWindowMinutes: 10080
    })
  })

  it('stores zero reset credits as a valid Codex usage snapshot value', async () => {
    await openaiAccountService.updateCodexUsageSnapshot('account-1', {
      rateLimitResetCreditsAvailableCount: 0
    })

    expect(mockHset).toHaveBeenCalledWith(
      'openai:account:account-1',
      expect.objectContaining({
        codexRateLimitResetCreditsAvailableCount: '0',
        codexUsageUpdatedAt: expect.any(String)
      })
    )
  })

  it('normalizes Codex invite emails from mixed separators', () => {
    const emails = openaiAccountService.normalizeCodexInviteEmails(
      'User@example.com, user@example.com\nsecond@example.com；third@example.com'
    )

    expect(emails).toEqual(['User@example.com', 'second@example.com', 'third@example.com'])
  })

  it('rejects invalid Codex invite emails', () => {
    expect(() => openaiAccountService.normalizeCodexInviteEmails(['not-an-email'])).toThrow(
      'Invalid email address'
    )
  })
})
