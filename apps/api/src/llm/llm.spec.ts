import { AgentRole } from '@archivato/shared';
import { MockLlmProvider } from './mock-llm.provider';
import { LlmJsonParseError } from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';
import {
  ProductAnalystAgent,
  type IntentAnalysis,
} from './agents/product-analyst.agent';

describe('parseJsonFromLlm', () => {
  it('parses plain JSON', () => {
    expect(parseJsonFromLlm<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json code fences', () => {
    const raw = '```json\n{"ok":true}\n```';
    expect(parseJsonFromLlm<{ ok: boolean }>(raw)).toEqual({ ok: true });
  });

  it('slices JSON out of surrounding prose', () => {
    const raw = 'Here you go:\n{"name":"x"}\nHope that helps!';
    expect(parseJsonFromLlm<{ name: string }>(raw)).toEqual({ name: 'x' });
  });

  it('throws LlmJsonParseError on non-JSON', () => {
    expect(() => parseJsonFromLlm('no json here')).toThrow(LlmJsonParseError);
  });
});

describe('MockLlmProvider', () => {
  it('echoes the last user message as JSON by default', async () => {
    const mock = new MockLlmProvider();
    const result = await mock.completeJson<{ provider: string; echo: string }>([
      { role: 'user', content: 'hello' },
    ]);
    expect(result).toEqual({ provider: 'mock', echo: 'hello' });
  });

  it('returns queued responses FIFO', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({ step: 1 }, { step: 2 });
    expect(await mock.completeJson([])).toEqual({ step: 1 });
    expect(await mock.completeJson([])).toEqual({ step: 2 });
  });
});

describe('ProductAnalystAgent (sample agent over the LLM core)', () => {
  it('returns a validated, typed IntentAnalysis via the mock provider', async () => {
    const scripted: IntentAnalysis = {
      summary: 'A clinic management system.',
      domain: 'healthcare',
      primaryUsers: ['doctors', 'patients', 'admins'],
      coreCapabilities: ['appointments', 'billing', 'records'],
      openQuestions: ['Are payments online or in-person?'],
    };

    const mock = new MockLlmProvider();
    mock.enqueueJson(scripted);

    const agent = new ProductAnalystAgent(mock);
    const result = await agent.analyze({
      idea: 'Clinic management with appointments, billing, doctors, patients',
      industry: 'healthcare',
      scale: 'startup',
    });

    expect(agent.role).toBe(AgentRole.ProductAnalyst);
    expect(result).toEqual(scripted);
    expect(result.primaryUsers).toContain('doctors');
  });
});
