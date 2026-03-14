import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecuritySection } from './SecuritySection';

vi.mock('../../../api', () => ({
  changePassword: vi.fn(),
  forgotPassword: vi.fn(),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      username: 'piques',
      displayName: 'Jon',
      email: 'jon@example.com',
    },
  }),
}));

import { forgotPassword } from '../../../api';

const mockForgotPassword = vi.mocked(forgotPassword);

describe('SecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockForgotPassword.mockResolvedValue({ message: 'If that email exists, we sent a reset code.' });
  });

  it('sends a password reset email from the change-password panel', async () => {
    render(<SecuritySection onOpenMfa={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    fireEvent.click(screen.getByRole('button', { name: /reset via email/i }));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith('jon@example.com');
    });
  });
});
