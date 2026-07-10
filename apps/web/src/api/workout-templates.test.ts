import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateResponse } from '@trener/shared';
import { apiFetch } from './client';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './workout-templates';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

const mockFetch = vi.mocked(apiFetch);

const sample: TemplateResponse = {
  id: 'tpl1',
  clientId: null,
  clientName: null,
  name: 'Ноги A',
  categoryTag: 'силовая',
  shortDescription: null,
  exercises: [
    {
      position: 0,
      exerciseId: 'ex1',
      exerciseName: 'Присед',
      sets: 3,
      reps: 10,
      weightKg: null,
      timeSec: null,
      restSec: 90,
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('workout-templates api', () => {
  it('listTemplates разворачивает {templates}', async () => {
    mockFetch.mockResolvedValueOnce({ templates: [sample] });
    await expect(listTemplates()).resolves.toEqual([sample]);
    expect(mockFetch).toHaveBeenCalledWith('/workout-templates', expect.objectContaining({}));
  });

  it('getTemplate разворачивает {template}', async () => {
    mockFetch.mockResolvedValueOnce({ template: sample });
    await expect(getTemplate('tpl1')).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith('/workout-templates/tpl1', expect.objectContaining({}));
  });

  it('createTemplate делает POST', async () => {
    mockFetch.mockResolvedValueOnce({ template: sample });
    await expect(
      createTemplate({
        name: 'Ноги A',
        categoryTag: 'силовая',
        exercises: [{ exerciseId: 'ex1', sets: 3, restSec: 90 }],
      }),
    ).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith(
      '/workout-templates',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updateTemplate делает PATCH по id', async () => {
    mockFetch.mockResolvedValueOnce({ template: sample });
    await expect(updateTemplate('tpl1', { name: 'Ноги B' })).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith(
      '/workout-templates/tpl1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteTemplate делает DELETE по id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await expect(deleteTemplate('tpl1')).resolves.toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      '/workout-templates/tpl1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
