import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
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

  // Серверная ошибка: неверные данные → понятный текст; иначе сообщение сервера.
  const serverError = loginMutation.isError
    ? loginMutation.error instanceof ApiError && loginMutation.error.status === 401
      ? 'Неверный email или пароль'
      : loginMutation.error instanceof ApiError
        ? loginMutation.error.message
        : 'Не удалось войти. Попробуйте позже.'
    : '';

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    loginMutation.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          void navigate('/');
        },
      },
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-2">
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-none tracking-[-0.02em] text-accent-text">
        Вход
      </h1>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={showErrors ? errors.email : ''}
        />
        <Field
          label="Пароль"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={showErrors ? errors.password : ''}
        />
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}
        <Button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Входим…' : 'Войти'}
        </Button>
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
