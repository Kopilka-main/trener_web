import type {
  SupportRepo,
  SupportSource,
  SupportOwner,
  SupportDirection,
  SupportAttachmentKind,
} from './support.repo.js';
import type { Mailer } from '../../auth/mailer.js';
import type { TelegramClient } from './telegram.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';

// Порт хранилища вложений: подмножество Storage/FilesRepo, нужное для сохранения файла
// обращения (диск + строка files). undefined в deps → submitAttachment недоступен.
export type SupportAttachmentStore = {
  save: Storage['save'];
  remove: Storage['remove'];
  createFile: FilesRepo['create'];
};

export type SupportServiceDeps = {
  newId: () => string;
  now: () => Date;
  // Email администратора для дубля обращений. Пусто/undefined → письмо не шлётся,
  // обращение только сохраняется в БД.
  supportEmail?: string;
  // Telegram-клиент доставки обращения: одна тема на пользователя (создаём/переиспользуем),
  // фолбэк в общий чат. undefined → в Telegram не шлём.
  telegram?: Pick<
    TelegramClient,
    | 'createTopic'
    | 'sendToTopic'
    | 'sendToGeneral'
    | 'sendPhotoToTopic'
    | 'sendDocumentToTopic'
    | 'sendPhotoToGeneral'
    | 'sendDocumentToGeneral'
  >;
  // Хранилище вложений (диск + files). undefined → submitAttachment бросит.
  store?: SupportAttachmentStore;
};

export type SubmitSupportInput = {
  source: SupportSource;
  trainerId?: string | null;
  clientAccountId?: string | null;
  // Снимок отправителя (email/имя) на момент обращения; оба опциональны.
  email?: string | null;
  name?: string | null;
  text: string;
};

// Ответ саппорта из темы Telegram: topicId связывает его с обращением, text — тело.
export type AddAgentReplyInput = { topicId: number; text: string };

// Вложение обращения от пользователя (картинка/файл). fileId раздаётся GET /api/files/:id.
export type SupportAttachmentInput = {
  source: SupportSource;
  trainerId?: string | null;
  clientAccountId?: string | null;
  email?: string | null;
  name?: string | null;
  kind: SupportAttachmentKind;
  file: Buffer;
  // MIME файла (для строки files) и оригинальное имя (для отображения/скачивания).
  mime: string;
  filename: string;
  // Необязательная подпись пользователя к вложению.
  caption?: string;
};

// Вложение элемента ленты для отдачи в приложение (или null — текстовое сообщение).
export type SupportThreadAttachment = {
  fileId: string;
  kind: SupportAttachmentKind;
  name: string;
};

// Элемент ленты переписки для отдачи в приложение (без снимка отправителя/темы).
export type SupportThreadItem = {
  id: string;
  direction: SupportDirection;
  text: string;
  attachment: SupportThreadAttachment | null;
  createdAt: Date;
};

const sourceLabel: Record<SupportSource, string> = {
  trainer: 'тренер',
  client: 'клиент',
};

// Сервис поддержки без HTTP: сохраняет обращение в repo и (если задан SUPPORT_EMAIL)
// дублирует письмом администратору. Двусторонняя связь: у каждого пользователя ОДНА тема в
// Telegram — обращение уходит в его существующую тему, а если её нет/она удалена, заводится
// новая (её topicId запоминается). Ответ саппорта из той же темы возвращается 'out'-строкой
// и пушем владельцу. Почта/Telegram — best-effort: их ошибка НЕ роняет запрос, обращение уже
// в БД.
export function makeSupportService(repo: SupportRepo, mailer: Mailer, deps: SupportServiceDeps) {
  return {
    async submit(input: SubmitSupportInput): Promise<void> {
      const sender = [input.name, input.email].filter((v) => !!v).join(' ');
      // Заголовок темы (forum topic) на обращение: источник + отправитель.
      const title = `🆘 ${sourceLabel[input.source]} · ${input.name || input.email || 'аноним'}`;
      const body =
        `Источник: ${sourceLabel[input.source]}\n` +
        `Отправитель: ${sender || '—'}\n\n` +
        input.text;

      // Одна тема на пользователя: текущая тема владельца = topicId его последнего сообщения.
      const owner: SupportOwner = {
        source: input.source,
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
      };
      const current = await repo.findCurrentTopicForOwner(owner);

      // Доставка (best-effort): шлём в существующую тему; если её нет/удалена (пост упал) —
      // создаём новую и шлём в неё; если тему завести нельзя — фолбэк в общий чат. Любая
      // ошибка НЕ роняет запрос — обращение всё равно сохраним ниже (topicId = null).
      const client = deps.telegram;
      let topicId: number | undefined;
      if (client) {
        if (current != null) {
          try {
            await client.sendToTopic(current, body);
            topicId = current;
          } catch {
            // тема удалена/недоступна → создадим новую ниже
          }
        }
        if (topicId === undefined) {
          const t = await client.createTopic(title);
          if (t !== undefined) {
            try {
              await client.sendToTopic(t, body);
              topicId = t;
            } catch {
              // пост в новую тему упал — оставим topicId undefined
            }
          } else {
            try {
              await client.sendToGeneral(body);
            } catch {
              // общий чат тоже недоступен — доставку пропускаем
            }
          }
        }
      }

      await repo.insert({
        id: deps.newId(),
        source: input.source,
        direction: 'in',
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
        telegramTopicId: topicId ?? null,
        email: input.email ?? null,
        name: input.name ?? null,
        text: input.text,
        createdAt: deps.now(),
      });

      if (!deps.supportEmail) return;

      try {
        await mailer.send({
          to: deps.supportEmail,
          subject: 'FitBond: обращение в поддержку',
          text: body,
        });
      } catch {
        // Почта необязательна: обращение уже сохранено, ошибку SMTP проглатываем.
      }
    },

    // Вложение (картинка/файл) от пользователя. Порядок: сохраняем файл (диск + files) →
    // получаем fileId; собираем подпись (источник/отправитель + caption); шлём в тему
    // (та же логика, что submit: текущая тема → новая → общий чат), для kind='image'
    // sendPhoto*, для 'file' sendDocument*; сбой темы → фолбэк в общий чат. Пишем
    // in-строку с attachment-полями. Доставка best-effort — файл уже сохранён.
    async submitAttachment(input: SupportAttachmentInput): Promise<void> {
      if (!deps.store) throw new Error('support attachment store is not configured');
      const sender = [input.name, input.email].filter((v) => !!v).join(' ');
      const title = `🆘 ${sourceLabel[input.source]} · ${input.name || input.email || 'аноним'}`;
      const header =
        `Источник: ${sourceLabel[input.source]}\n` + `Отправитель: ${sender || '—'}\n\n`;
      // Подпись Telegram: шапка + подпись пользователя (если есть).
      const caption = input.caption ? header + input.caption : header.trimEnd();

      // Сохраняем файл: диск (директория по владельцу) + строка files (XOR тренер/аккаунт).
      const dirKey = input.trainerId ?? input.clientAccountId ?? 'support';
      const ext = extFromName(input.filename) ?? extFromMime(input.mime) ?? 'bin';
      const fileId = deps.newId();
      const saved = await deps.store.save(dirKey, null, fileId, ext, input.file);
      try {
        await deps.store.createFile({
          id: fileId,
          trainerId: input.source === 'trainer' ? (input.trainerId ?? null) : null,
          clientId: null,
          accountId: input.source === 'client' ? (input.clientAccountId ?? null) : null,
          mime: input.mime,
          sizeBytes: saved.sizeBytes,
          storagePath: saved.storagePath,
          originalName: input.filename,
        });
      } catch (err) {
        await deps.store.remove(saved.storagePath).catch(() => undefined);
        throw err;
      }

      // Доставка в Telegram (best-effort): текущая тема → новая → общий чат.
      const owner: SupportOwner = {
        source: input.source,
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
      };
      const current = await repo.findCurrentTopicForOwner(owner);
      const client = deps.telegram;
      let topicId: number | undefined;
      const sendToTopic = (t: number): Promise<void> =>
        input.kind === 'image'
          ? client!.sendPhotoToTopic(t, input.file, input.filename, caption)
          : client!.sendDocumentToTopic(t, input.file, input.filename, caption);
      const sendToGeneral = (): Promise<void> =>
        input.kind === 'image'
          ? client!.sendPhotoToGeneral(input.file, input.filename, caption)
          : client!.sendDocumentToGeneral(input.file, input.filename, caption);
      if (client) {
        if (current != null) {
          try {
            await sendToTopic(current);
            topicId = current;
          } catch {
            // тема удалена/недоступна → создадим новую ниже
          }
        }
        if (topicId === undefined) {
          const t = await client.createTopic(title);
          if (t !== undefined) {
            try {
              await sendToTopic(t);
              topicId = t;
            } catch {
              // пост в новую тему упал — оставим topicId undefined
            }
          } else {
            try {
              await sendToGeneral();
            } catch {
              // общий чат тоже недоступен — доставку пропускаем
            }
          }
        }
      }

      await repo.insert({
        id: deps.newId(),
        source: input.source,
        direction: 'in',
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
        telegramTopicId: topicId ?? null,
        email: input.email ?? null,
        name: input.name ?? null,
        text: input.caption ?? '',
        attachmentFileId: fileId,
        attachmentKind: input.kind,
        attachmentName: input.filename,
        createdAt: deps.now(),
      });
    },

    // Ответ саппорта из темы Telegram → 'out'-строка тому же владельцу. Владелец найден
    // (тема наша) → сохраняем и возвращаем владельца (для пуша); не найден (чужая тема) →
    // null (игнор). Снимок отправителя для 'out' пуст — ответ идёт от саппорта, не от юзера.
    async addAgentReply(input: AddAgentReplyInput): Promise<SupportOwner | null> {
      const owner = await repo.findOwnerByTopicId(input.topicId);
      if (!owner) return null;
      await repo.insert({
        id: deps.newId(),
        source: owner.source,
        direction: 'out',
        trainerId: owner.trainerId,
        clientAccountId: owner.clientAccountId,
        telegramTopicId: input.topicId,
        email: null,
        name: null,
        text: input.text,
        createdAt: deps.now(),
      });
      return owner;
    },

    async threadForTrainer(trainerId: string): Promise<SupportThreadItem[]> {
      return (await repo.listForTrainer(trainerId)).map(toThreadItem);
    },

    async threadForClient(clientAccountId: string): Promise<SupportThreadItem[]> {
      return (await repo.listForClient(clientAccountId)).map(toThreadItem);
    },
  };
}

function toThreadItem(r: {
  id: string;
  direction: SupportDirection;
  text: string;
  attachmentFileId?: string | null;
  attachmentKind?: SupportAttachmentKind | null;
  attachmentName?: string | null;
  createdAt: Date;
}): SupportThreadItem {
  const attachment: SupportThreadAttachment | null =
    r.attachmentFileId && r.attachmentKind
      ? { fileId: r.attachmentFileId, kind: r.attachmentKind, name: r.attachmentName ?? '' }
      : null;
  return { id: r.id, direction: r.direction, text: r.text, attachment, createdAt: r.createdAt };
}

// Расширение из оригинального имени файла (после последней точки), либо null.
function extFromName(name: string): string | null {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return null;
  const ext = name.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

// Резервное расширение из MIME (для картинок без расширения в имени).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};
function extFromMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export type SupportService = ReturnType<typeof makeSupportService>;
