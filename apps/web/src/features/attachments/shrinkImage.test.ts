import { describe, expect, it } from 'vite-plus/test';
import { targetSize } from './shrinkImage';

describe('targetSize', () => {
  it('scales a landscape photo so the width is 2048', () => {
    expect(targetSize(4096, 3072)).toEqual({ width: 2048, height: 1536 });
  });
  it('scales a portrait photo so the height is 2048', () => {
    expect(targetSize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  });
  it('leaves an image that is already small alone', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(2048, 2048)).toEqual({ width: 2048, height: 2048 });
  });
});
