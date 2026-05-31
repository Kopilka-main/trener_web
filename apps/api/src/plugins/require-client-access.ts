import type { FastifyReply, FastifyRequest } from 'fastify';
import { notFound, unauthorized } from '../errors.js';

type LinkChecker = { isLinked: (trainerId: string, clientId: string) => Promise<boolean> };

// Фабрика guard'а: пускает, только если текущий тренер связан с клиентом из params.id.
// Иначе 404 (не раскрываем существование чужого клиента). Seam для вложенных
// ресурсов Фазы 4 (тренировки/занятия под клиентом).
export function makeRequireClientAccess(checker: LinkChecker) {
  return async function requireClientAccess(
    req: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    const { id } = req.params as { id?: string };
    if (!id || !(await checker.isLinked(req.trainerId, id))) {
      throw notFound('Клиент не найден');
    }
  };
}
