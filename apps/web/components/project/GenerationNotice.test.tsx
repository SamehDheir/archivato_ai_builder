import { render, screen } from '@testing-library/react';
import type { GenerationProvenance } from '@archivato/shared';
import { GenerationNotice } from './GenerationNotice';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const stamp = (over: Partial<GenerationProvenance> = {}): GenerationProvenance => ({
  mode: 'llm',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  ...over,
});

describe('GenerationNotice', () => {
  it('renders nothing for a healthy AI-generated artifact', () => {
    const { container } = render(<GenerationNotice generation={stamp()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unstamped artifact', () => {
    // Rows predating provenance are unknown, not degraded — warning on a guess
    // would nag every old project into re-running a billed Pro stage.
    const { container } = render(<GenerationNotice generation={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when the artifact came from the deterministic fallback', () => {
    render(<GenerationNotice generation={stamp({ mode: 'fallback', degradedReason: 'timeout' })} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('generation.title')).toBeInTheDocument();
    expect(screen.getByText('generation.reason.timeout')).toBeInTheDocument();
  });

  it('warns on the mock provider even when the agent took the llm path', () => {
    render(<GenerationNotice generation={stamp({ provider: 'mock', model: 'mock' })} />);

    expect(screen.getByText('generation.reason.no_provider')).toBeInTheDocument();
  });

  it('offers a regenerate action only when one is wired', () => {
    const onRegenerate = jest.fn();
    const { rerender } = render(
      <GenerationNotice generation={stamp({ mode: 'fallback' })} onRegenerate={onRegenerate} />,
    );
    expect(screen.getByRole('button', { name: 'generation.regenerate' })).toBeInTheDocument();

    // The share page and the example project render read-only.
    rerender(<GenerationNotice generation={stamp({ mode: 'fallback' })} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables the action while a regeneration is running', () => {
    render(
      <GenerationNotice
        generation={stamp({ mode: 'fallback' })}
        busy
        onRegenerate={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'generation.working' })).toBeDisabled();
  });
});
