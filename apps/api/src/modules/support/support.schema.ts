// Реэкспорт Zod-контракта поддержки из общего пакета (единый источник истины —
// на него сядут мобильные приложения).
export {
  submitSupportRequestSchema,
  submitSupportResponseSchema,
  type SubmitSupportRequest,
  type SubmitSupportResponse,
} from '@trener/shared';
