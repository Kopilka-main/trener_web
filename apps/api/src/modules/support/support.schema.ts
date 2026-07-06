// Реэкспорт Zod-контракта поддержки из общего пакета (единый источник истины —
// на него сядут мобильные приложения).
export {
  submitSupportRequestSchema,
  submitSupportResponseSchema,
  supportThreadMessageSchema,
  supportThreadResponseSchema,
  type SubmitSupportRequest,
  type SubmitSupportResponse,
  type SupportThreadMessage,
  type SupportThreadResponse,
} from '@trener/shared';
