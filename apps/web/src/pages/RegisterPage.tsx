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
    <div className="flex min-h-screen flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Регистрация</h1>
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
          <p className="text-sm text-slate-500" role="alert">
            Не удалось зарегистрироваться. Проверьте введённые данные.
          </p>
        )}
        <Button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Создаём…' : 'Создать аккаунт'}
        </Button>
      </form>
      <p className="text-sm text-slate-500">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="font-medium text-slate-900 underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
