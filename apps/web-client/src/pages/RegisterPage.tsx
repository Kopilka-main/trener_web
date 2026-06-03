import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientRegister } from '../api/auth';
import { ApiError } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function RegisterPage() {
  const reg = useClientRegister();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const emailTaken = reg.error instanceof ApiError && reg.error.code === 'EMAIL_TAKEN';

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
  const hasErrors = Object.values(errors).some((v) => v !== '');
  const emailError =
    (showErrors ? errors.email : '') || (emailTaken ? 'Email уже зарегистрирован' : '');
  const serverError =
    reg.isError && !emailTaken
      ? reg.error instanceof ApiError
        ? reg.error.message
        : 'Не удалось зарегистрироваться. Попробуйте позже.'
      : '';

  function field(
    label: string,
    value: string,
    set: (v: string) => void,
    error: string,
    type = 'text',
    autoComplete = 'off',
  ) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        <input
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => set(e.target.value)}
          className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
            error ? 'border-danger' : 'border-line'
          }`}
        />
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </label>
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    reg.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6 py-8">
      <h1 className="font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.02em] text-accent">
        Регистрация
      </h1>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {field(
          'Имя',
          firstName,
          setFirstName,
          showErrors ? errors.firstName : '',
          'text',
          'given-name',
        )}
        {field(
          'Фамилия',
          lastName,
          setLastName,
          showErrors ? errors.lastName : '',
          'text',
          'family-name',
        )}
        {field('Email', email, setEmail, emailError, 'email', 'email')}
        {field(
          'Пароль',
          password,
          setPassword,
          showErrors ? errors.password : '',
          'password',
          'new-password',
        )}
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={reg.isPending}
          className="rounded-xl bg-accent py-3 font-semibold text-accent-on disabled:opacity-60"
        >
          {reg.isPending ? 'Создаём…' : 'Создать аккаунт'}
        </button>
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
