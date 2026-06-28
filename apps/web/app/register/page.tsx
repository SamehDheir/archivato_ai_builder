'use client';

import { AuthForm } from '../AuthForm';

/** Dedicated /register route (see /login for the navigation rationale). */
export default function RegisterPage() {
  return (
    <AuthForm initialMode="register" onSuccess={() => window.location.assign('/')} />
  );
}
