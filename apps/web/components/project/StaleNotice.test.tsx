import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { upstreamStamp, type UpstreamRevisions } from '@archivato/shared';
import { StaleNotice } from './StaleNotice';

// Chrome-only component: an identity `t` keeps the assertions on behavior.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const v1: UpstreamRevisions = {
  requirements: '2026-01-01T00:00:00.000Z',
  systemDesign: '2026-01-01T00:01:00.000Z',
  databaseDesign: '2026-01-01T00:02:00.000Z',
  apiDesign: '2026-01-01T00:03:00.000Z',
};
const v2: UpstreamRevisions = { ...v1, apiDesign: '2026-02-01T00:00:00.000Z' };

const roadmapFrom = (r: UpstreamRevisions) => ({
  sourceStamp: upstreamStamp('roadmap', r),
});

describe('StaleNotice', () => {
  it('says nothing when the artifact matches the current design', () => {
    const { container } = render(
      <StaleNotice
        stage="roadmap"
        artifact={roadmapFrom(v1)}
        revisions={v1}
        busy={false}
        onRegenerate={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('warns and offers to regenerate once the design has moved on', async () => {
    const onRegenerate = jest.fn();
    render(
      <StaleNotice
        stage="roadmap"
        artifact={roadmapFrom(v1)}
        revisions={v2}
        busy={false}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('stale.title');
    await userEvent.click(screen.getByRole('button', { name: 'stale.regenerate' }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('stays silent for an artifact generated before stamping existed', () => {
    // No stamp = we cannot know what it was built from. Nagging every existing
    // project to re-run a billed Pro stage on a guess would be worse than the bug.
    const { container } = render(
      <StaleNotice
        stage="roadmap"
        artifact={{}}
        revisions={v2}
        busy={false}
        onRegenerate={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
