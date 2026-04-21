import { describe, it, expect } from 'vitest';
import robots from './robots';

describe('robots.ts — AI bots configuration', () => {
  const robotsConfig = robots();
  const rules = (robotsConfig.rules || []) as Array<Record<string, unknown>>;

  it('should have rules array', () => {
    expect(robotsConfig.rules).toBeDefined();
    expect(Array.isArray(robotsConfig.rules)).toBe(true);
  });

  it('should contain all expected AI user agents', () => {
    const userAgents = rules.map((r: Record<string, unknown>) => String(r.userAgent));

    const expectedAgents = [
      '*',
      'GPTBot',
      'ClaudeBot',
      'Google-Extended',
      'CCBot',
      'Applebot-Extended',
      'Amazonbot',
      'ChatGPT-User',
      'PerplexityBot',
      'Bytespider',
    ];

    for (const agent of expectedAgents) {
      expect(userAgents).toContain(agent);
    }
  });

  it('should allow all bots access to / (root)', () => {
    // Find the wildcard rule and allow-all bots (ChatGPT-User, PerplexityBot)
    const allowAllBots = ['ChatGPT-User', 'PerplexityBot'];
    for (const botName of allowAllBots) {
      const botRule = rules.find((r: Record<string, unknown>) => r.userAgent === botName);
      expect(botRule).toBeDefined();
      expect(Array.isArray(botRule?.allow) ? botRule.allow : [botRule?.allow]).toContain('/');
    }
  });

  it('should disallow /app/, /auth/, /onboarding/ for most AI bots', () => {
    const restrictedBots = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Amazonbot'];

    for (const botName of restrictedBots) {
      const botRule = rules.find((r: Record<string, unknown>) => r.userAgent === botName);
      const disallow = Array.isArray(botRule?.disallow) ? botRule.disallow : [botRule?.disallow];
      expect(disallow).toContain('/app/');
      expect(disallow).toContain('/auth/');
      expect(disallow).toContain('/onboarding/');
    }
  });

  it('should block Bytespider completely', () => {
    const botRule = rules.find((r: Record<string, unknown>) => r.userAgent === 'Bytespider');
    const disallow = Array.isArray(botRule?.disallow) ? botRule.disallow : [botRule?.disallow];
    expect(disallow).toContain('/');
  });

  it('should include sitemap', () => {
    expect(robotsConfig.sitemap).toBeDefined();
    expect(robotsConfig.sitemap).toMatch(/sitemap\.xml$/);
  });
});
