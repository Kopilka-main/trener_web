import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './image';

interface BitmapStub {
  width: number;
  height: number;
  close: () => void;
}

describe('compressImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('даунскейлит большую сторону до maxSize и отдаёт JPEG-Blob', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((): Promise<BitmapStub> => Promise.resolve({ width: 2048, height: 1024, close })),
    );

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);

    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb, type) => {
        cb(new Blob(['x'], { type: type ?? 'image/png' }));
      });

    const file = new File(['orig'], 'photo.png', { type: 'image/png' });
    const blob = await compressImage(file);

    expect(blob.type).toBe('image/jpeg');
    // toBlob вызван с 'image/jpeg'
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0]?.[1]).toBe('image/jpeg');
    expect(toBlob.mock.calls[0]?.[2]).toBe(0.82);
    // даунскейл: большая сторона 2048 -> 512, scale 0.25
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('не апскейлит маленькое изображение', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((): Promise<BitmapStub> => Promise.resolve({ width: 100, height: 80, close: vi.fn() })),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => {
      cb(new Blob(['x'], { type: type ?? 'image/png' }));
    });

    const file = new File(['orig'], 'photo.png', { type: 'image/png' });
    await compressImage(file);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 80);
  });
});
