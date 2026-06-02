import { useNavigate } from 'react-router-dom';
import { useLogout, useMe } from '../api/auth';
import { Button } from '../components/Button';

export function MorePage() {
  const navigate = useNavigate();
  const me = useMe();
  const logoutMutation = useLogout();

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        void navigate('/login');
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-6 pt-4">
      <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-none tracking-[-0.02em]">
        Ещё
      </h1>
      {me.data && (
        <div className="flex flex-col gap-0.5 rounded-2xl bg-card px-4 py-3">
          <span className="text-base font-semibold text-ink">
            {me.data.trainer.firstName} {me.data.trainer.lastName}
          </span>
          <span className="text-sm text-ink-muted">{me.data.trainer.email}</span>
        </div>
      )}
      <Button variant="secondary" onClick={handleLogout} disabled={logoutMutation.isPending}>
        {logoutMutation.isPending ? 'Выходим…' : 'Выйти'}
      </Button>
    </div>
  );
}
