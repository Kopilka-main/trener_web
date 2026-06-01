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
    <div className="flex flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Ещё</h1>
      {me.data && (
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-medium text-slate-900">
            {me.data.trainer.firstName} {me.data.trainer.lastName}
          </span>
          <span className="text-sm text-slate-500">{me.data.trainer.email}</span>
        </div>
      )}
      <Button variant="secondary" onClick={handleLogout} disabled={logoutMutation.isPending}>
        {logoutMutation.isPending ? 'Выходим…' : 'Выйти'}
      </Button>
    </div>
  );
}
