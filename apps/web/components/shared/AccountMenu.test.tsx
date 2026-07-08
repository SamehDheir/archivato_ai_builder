import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthUser } from '@archivato/shared';
import { AccountMenu } from './AccountMenu';

// i18n is out of scope for this test — return the key so we can assert on it.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const user: AuthUser = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  emailVerified: true,
  role: 'user',
  roles: [],
  permissions: [],
  providers: ['password'],
  createdAt: new Date().toISOString(),
};

describe('AccountMenu', () => {
  it('is closed until the avatar trigger is clicked', async () => {
    render(<AccountMenu user={user} onLogout={jest.fn()} />);
    expect(
      screen.queryByRole('menuitem', { name: 'header.settings' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'header.account' }),
    );

    expect(
      screen.getByRole('menuitem', { name: 'header.settings' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      screen.getByRole('menuitem', { name: 'header.signOut' }),
    ).toBeInTheDocument();
    // The email is surfaced in the menu header.
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('calls onLogout when Sign out is chosen', async () => {
    const onLogout = jest.fn();
    render(<AccountMenu user={user} onLogout={onLogout} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'header.account' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'header.signOut' }),
    );
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    render(<AccountMenu user={user} onLogout={jest.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'header.account' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'header.settings' }),
    ).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('menuitem', { name: 'header.settings' }),
    ).not.toBeInTheDocument();
  });

  it('shows an unverified badge for an unverified account', async () => {
    render(
      <AccountMenu user={{ ...user, emailVerified: false }} onLogout={jest.fn()} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'header.account' }),
    );
    expect(screen.getByText('header.unverified')).toBeInTheDocument();
  });
});
