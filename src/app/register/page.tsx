'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create account.');

      const login = await signIn('credentials', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        redirect: false,
      });
      if (login?.error) {
        router.replace('/login?registered=1');
        return;
      }
      router.replace('/#dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12 dark:bg-gray-950">
      <section className="mx-auto max-w-md rounded-2xl border bg-white p-7 shadow-xl dark:bg-gray-900">
        <h1 className="text-2xl font-bold">Create a customer account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manufacturer accounts are created by a BlockGuard administrator.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Full name
            <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={100} required autoComplete="name" />
          </label>
          <label className="block text-sm font-medium">Email
            <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} required autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">Password (12–128 characters)
            <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} maxLength={128} required autoComplete="new-password" />
          </label>
          <label className="block text-sm font-medium">Confirm password
            <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} minLength={12} maxLength={128} required autoComplete="new-password" />
          </label>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="w-full rounded-md bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            {loading ? 'Creating account…' : 'Create customer account'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">Already registered? <Link className="font-semibold text-emerald-700 hover:underline" href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
