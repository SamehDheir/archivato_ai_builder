import { fireEvent, render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

describe('UserAvatar', () => {
  it('shows initials when there is no picture', () => {
    render(<UserAvatar name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the image when a src is provided', () => {
    render(
      <UserAvatar name="Ada Lovelace" src="data:image/png;base64,abc" />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(img).toHaveAttribute('alt', 'Ada Lovelace');
    // The initials fallback is not rendered while the image is showing.
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('falls back to initials when the image fails to load', () => {
    render(<UserAvatar name="Ada Lovelace" src="https://broken/x.png" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('retries a fresh image after a previous src failed (broken flag resets)', () => {
    const { rerender } = render(
      <UserAvatar name="Ada Lovelace" src="https://broken/x.png" />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    // A newly uploaded picture must attempt to load again, not stay on initials.
    rerender(
      <UserAvatar name="Ada Lovelace" src="data:image/png;base64,new" />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,new',
    );
  });

  it('falls back to "?" for an empty name', () => {
    render(<UserAvatar name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
