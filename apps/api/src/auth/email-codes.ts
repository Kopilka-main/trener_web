// Создание и проверка одноразовых 6-значных email-кодов (OTP). Один активный код на
// (subjectType, subjectId, purpose): createCode стирает прежние того же назначения перед
// вставкой. TTL — 15 минут. verifyCode гасит код (usedAt), делая его одноразовым.
import { and, desc, eq, isNull } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { Db } from '../db/client.js';
import { emailCodes } from '../db/schema.js';

export const CODE_TTL_MS = 15 * 60 * 1000; // 15 минут

export type SubjectType = 'trainer' | 'client';
export type CodePurpose = 'reset-password';

// Криптостойкий 6-значный код: 0..999999 с паддингом нулями до 6 знаков.
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export type CreateCodeInput = {
  subjectType: SubjectType;
  subjectId: string;
  purpose: CodePurpose;
  newId: () => string;
  now: Date;
};

// Удаляет прежние коды того же (subjectType, subjectId, purpose), генерит и вставляет
// новый со сроком now + TTL. Возвращает plain-код (для отправки письмом).
export async function createCode(db: Db, input: CreateCodeInput): Promise<string> {
  await db
    .delete(emailCodes)
    .where(
      and(
        eq(emailCodes.subjectType, input.subjectType),
        eq(emailCodes.subjectId, input.subjectId),
        eq(emailCodes.purpose, input.purpose),
      ),
    );
  const code = generateCode();
  await db.insert(emailCodes).values({
    id: input.newId(),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    code,
    purpose: input.purpose,
    expiresAt: new Date(input.now.getTime() + CODE_TTL_MS),
  });
  return code;
}

export type VerifyCodeInput = {
  subjectType: SubjectType;
  subjectId: string;
  code: string;
  purpose: CodePurpose;
  now: Date;
};

// Ищет НЕиспользованный неистёкший код по точному совпадению. Найден → гасит usedAt=now
// и возвращает true. Иначе → false (неверный/просроченный/уже использованный).
export async function verifyCode(db: Db, input: VerifyCodeInput): Promise<boolean> {
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.subjectType, input.subjectType),
        eq(emailCodes.subjectId, input.subjectId),
        eq(emailCodes.purpose, input.purpose),
        eq(emailCodes.code, input.code),
        isNull(emailCodes.usedAt),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  if (!row || row.expiresAt.getTime() < input.now.getTime()) return false;

  await db.update(emailCodes).set({ usedAt: input.now }).where(eq(emailCodes.id, row.id));
  return true;
}
