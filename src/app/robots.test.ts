import { describe, it, expect } from 'vitest';
import robots from './robots';

describe('robots.ts — AI bots configuration', () => {
  const robotsConfig = robots();

  it('should have rules array', () => {
    expect(robotsConfig.rules).toBeDefined();
    expect(Array.isArray(robotsConfig.rules)).toBe(true);
  });

  it('should contain all expected AI user agents', () => {
    const userAgents = robotsConfig.rules.map((r) => r.userAgent);

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
    const rules = robotsConfig.rules;

    // Find the wildcard rule and allow-all bots (ChatGPT-User, PerplexityBot)
    const allowAllBots = ['ChatGPT-User', 'PerplexityBot'];
    for (const botName of allowAllBots) {
      const botRule = rules.find((r) => r.userAgent === botName);
      expect(botRule).toBeDefined();
      expect(botRule?.allow).toContain('/');
    }
  });

  it('should disallow /app/, /auth/, /onboarding/ for most AI bots', () => {
    const rules = robotsConfig.rules;
    const restrictedBots = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Amazonbot'];

    for (const botName of restrictedBots) {
      const botRule = rules.find((r) => r.userAgent === botName);
      expect(botRule?.disallow).toContain('/app/');
      expect(botRule?.disallow).toContain('/auth/');
      expect(botRule?.disallow).toContain('/onboarding/');
    }
  });

  it('should block Bytespider completely', () => {
    const botRule = robotsConfig.rules.find((r) => r.userAgent === 'Bytespider');
    expect(botRule?.disallow).toContain('/');
  });

  it('should include sitemap', () => {
    expect(robotsConfig.sitemap).toBeDefined();
    expect(robotsConfig.sitemap).toMatch(/sitemap\.xml$/);
  });
});
