import { bitmapToData } from './process';

export const toImage = async (img: Blob) => {
  const elem = document.createElement('img');
  const loaded = new Promise<void>((resolve, reject) => {
    elem.onload = () => { resolve(); };
    elem.onerror = err => { reject(err); };
  });
  elem.src = URL.createObjectURL(img);
  await loaded;
  URL.revokeObjectURL(elem.src);
  return elem;
}

const sharedCanvas = document.createElement('canvas');
const sharedCtx = sharedCanvas.getContext('2d')!

type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export const getData = async (img: ImageSource, transfer?: boolean, maxSide?: number) => {
  let source: ImageSource = img;
  let width = img.width;
  let height = img.height;
  if (maxSide && Math.max(width, height) > maxSide) {
    const ratio = maxSide / Math.max(width, height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    source = canvas;
    if (img instanceof ImageBitmap) img.close();
  }
  if (sharedCanvas['transferControlToOffscreen' as 'getContext']) {
    const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
    return bitmapToData(bitmap, transfer);
  }
  sharedCanvas.width = width;
  sharedCanvas.height = height;
  sharedCtx.drawImage(source, 0, 0);
  const data = sharedCtx.getImageData(0, 0, width, height);
  if (source instanceof ImageBitmap) source.close();
  return data;
}

export const download = (file: Blob, name: string) => {
  const url = URL.createObjectURL(file);
  const el = document.createElement('a');
  el.download = name;
  el.href = url;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
