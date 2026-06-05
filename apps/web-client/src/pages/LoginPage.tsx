import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientLogin } from '../api/auth';
import { ApiError } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function LoginPage() {
  const login = useClientLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const errors = {
    email:
      email.trim() === ''
        ? 'Укажите email'
        : EMAIL_RE.test(email.trim())
          ? ''
          : 'Некорректный email',
    password: password === '' ? 'Укажите пароль' : '',
  };
  const hasErrors = errors.email !== '' || errors.password !== '';

  const serverError = login.isError
    ? login.error instanceof ApiError && login.error.status === 401
      ? 'Неверный email или пароль'
      : login.error instanceof ApiError
        ? login.error.message
        : 'Не удалось войти. Попробуйте позже.'
    : '';

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    login.mutate({ email: email.trim(), password });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-2">
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-none tracking-[-0.02em] text-accent-text">
        Вход
      </h1>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Email</span>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            aria-invalid={showErrors && errors.email ? true : undefined}
            aria-describedby={showErrors && errors.email ? 'login-email-error' : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
              showErrors && errors.email ? 'border-danger' : 'border-line'
            }`}
          />
          {showErrors && errors.email && (
            <span id="login-email-error" className="text-[12px] text-danger">
              {errors.email}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Пароль</span>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={showErrors && errors.password ? true : undefined}
            aria-describedby={showErrors && errors.password ? 'login-password-error' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
              showErrors && errors.password ? 'border-danger' : 'border-line'
            }`}
          />
          {showErrors && errors.password && (
            <span id="login-password-error" className="text-[12px] text-danger">
              {errors.password}
            </span>
          )}
        </label>
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-xl bg-accent py-3 font-semibold text-accent-on disabled:opacity-60"
        >
          {login.isPending ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="text-sm text-ink-muted">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-accent-text">
          Регистрация
        </Link>
      </p>
    </div>
  );
}
