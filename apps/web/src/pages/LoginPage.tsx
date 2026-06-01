import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../api/auth';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => {
          void navigate('/');
        },
      },
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Вход</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Пароль"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {loginMutation.isError && (
          <p className="text-sm text-slate-500" role="alert">
            Не удалось войти. Проверьте email и пароль.
          </p>
        )}
        <Button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Входим…' : 'Войти'}
        </Button>
      </form>
      <p className="text-sm text-slate-500">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-slate-900 underline">
          Регистрация
        </Link>
      </p>
    </div>
  );
}
