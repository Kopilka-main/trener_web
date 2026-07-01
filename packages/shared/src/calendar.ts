import { z } from 'zod';

// Ответ на запрос секретной ссылки iCal-фида расписания тренера.
// url = https://<host>/api/calendar/<token>.ics — на неё тренер подписывается
// в Google/iPhone календаре (односторонний экспорт занятий).
export const calendarFeedResponseSchema = z.object({ url: z.string() });
export type CalendarFeedResponse = z.infer<typeof calendarFeedResponseSchema>;
