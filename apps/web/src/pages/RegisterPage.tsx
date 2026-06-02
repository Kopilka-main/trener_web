import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../api/auth';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    registerMutation.mutate(
      { firstName, lastName, email, password },
      {
        onSuccess: () => {
          void navigate('/');
        },
      },
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6 py-8">
      <h1 className="font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.02em] text-accent">
        Регистрация
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Имя"
          name="firstName"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <Field
          label="Фамилия"
          name="lastName"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {registerMutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось зарегистрироваться. Проверьте введённые данные.
          </p>
        )}
        <Button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Создаём…' : 'Создать аккаунт'}
        </Button>
      </form>
      <p className="text-sm text-ink-muted">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="font-medium text-accent">
          Войти
        </Link>
      </p>
    </div>
  );
}
