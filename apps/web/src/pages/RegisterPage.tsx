import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  // Email уже занят (409 EMAIL_TAKEN) — показываем у поля email.
  const emailTaken =
    registerMutation.error instanceof ApiError && registerMutation.error.code === 'EMAIL_TAKEN';

  const errors = {
    firstName: firstName.trim() === '' ? 'Укажите имя' : '',
    lastName: lastName.trim() === '' ? 'Укажите фамилию' : '',
    email:
      email.trim() === ''
        ? 'Укажите email'
        : EMAIL_RE.test(email.trim())
          ? ''
          : 'Некорректный email',
    password: password.length < 8 ? 'Пароль не короче 8 символов' : '',
  };
  const hasErrors =
    errors.firstName !== '' ||
    errors.lastName !== '' ||
    errors.email !== '' ||
    errors.password !== '';

  const emailError =
    (showErrors ? errors.email : '') || (emailTaken ? 'Email уже зарегистрирован' : '');

  // Прочая серверная ошибка (не «email занят»).
  const serverError =
    registerMutation.isError && !emailTaken
      ? registerMutation.error instanceof ApiError
        ? registerMutation.error.message
        : 'Не удалось зарегистрироваться. Попробуйте позже.'
      : '';

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    registerMutation.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password },
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
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Имя"
          name="firstName"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={showErrors ? errors.firstName : ''}
        />
        <Field
          label="Фамилия"
          name="lastName"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={showErrors ? errors.lastName : ''}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <Field
          label="Пароль"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={showErrors ? errors.password : ''}
        />
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
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
