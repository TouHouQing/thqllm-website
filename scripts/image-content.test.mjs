import { describe, expect, it } from 'vitest';
import { analyzeRgbaContent, premultiplyColorChannel } from './image-content.mjs';

describe('image content analysis', () => {
  it('calculates premultiplied RGBA statistics from known pixels', () => {
    expect([
      premultiplyColorChannel(255, 128),
      premultiplyColorChannel(128, 128),
      premultiplyColorChannel(64, 128),
      128,
    ]).toEqual([128, 64, 32, 128]);

    const result = analyzeRgbaContent(
      Buffer.from([255, 0, 0, 255, 255, 128, 64, 128, 200, 100, 50, 0, 16, 32, 48, 16]),
      4,
    );

    expect(result.channelMedians).toEqual([1, 0, 0, 16]);
    expect(result.channelRanges).toEqual([255, 64, 32, 255]);
    expect(result.channelStandardDeviations[0]).toBeCloseTo(105.52961669597782);
    expect(result.channelStandardDeviations[1]).toBeCloseTo(27.436289836637897);
    expect(result.channelStandardDeviations[2]).toBeCloseTo(13.47915056670857);
    expect(result.channelStandardDeviations[3]).toBeCloseTo(102.30438651397114);
    expect(result.meaningfulPixelRatio).toBe(0.75);
    expect(result.visiblePixelRatio).toBe(0.75);
    expect(result.alphaCoverageRatio).toBeCloseTo(0.3911764705882353);
  });

  it('keeps high raw RGB variation below the meaningful threshold at alpha 16', () => {
    const data = Buffer.alloc(256 * 4);

    for (let pixelIndex = 0; pixelIndex < 256; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      data[offset] = pixelIndex;
      data[offset + 1] = 255 - pixelIndex;
      data[offset + 2] = (pixelIndex * 17) % 256;
      data[offset + 3] = 16;
    }

    const result = analyzeRgbaContent(data, 4);

    expect(result.channelRanges).toEqual([16, 16, 16, 0]);
    expect(result.meaningfulPixelRatio).toBe(0);
    expect(result.visiblePixelRatio).toBe(1);
    expect(result.alphaCoverageRatio).toBeCloseTo(16 / 255);
  });

  it('measures weighted alpha coverage independently from visible pixels', () => {
    const data = Buffer.alloc(100 * 4);
    data[3] = 21;

    const result = analyzeRgbaContent(data, 4);

    expect(result.visiblePixelRatio).toBe(0.01);
    expect(result.meaningfulPixelRatio).toBe(0.01);
    expect(result.alphaCoverageRatio).toBeCloseTo(21 / 255 / 100);
  });

  it('rejects zero-pixel input', () => {
    expect(() => analyzeRgbaContent(Buffer.alloc(0), 4)).toThrow(
      'Expected at least one decoded sRGB RGBA pixel.',
    );
  });
});
