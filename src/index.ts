import { extractDocument, Point, Quad } from './process';
import { toPDF } from './pdf';
import { toImage, getData, download, openDownloadUrl, shareBlob } from './io';
import { ProspectivePage, getFile, setFile } from './db';
import { getSession, onAuthChange, signIn, signOut } from './lib/auth';
import { getScanDownloadUrl, uploadScan } from './lib/scans';
import { CONFIG_ERROR, isSupabaseConfigured } from './lib/config';
import type { Session } from '@supabase/supabase-js';
import flashURL from 'url:./flash.svg';
import flashOffURL from 'url:./flash-off.svg';
import hdURL from 'url:./hd.svg';
import sdURL from 'url:./sd.svg';
import 'image-capture';

const root = document.getElementById('root') as HTMLDivElement;
const modal = document.getElementById('modal') as HTMLDivElement;
const captures = document.getElementById('captures') as HTMLDivElement;
const preview = document.getElementById('preview') as HTMLVideoElement;
const previewCrop = document.getElementById('preview-crop') as HTMLDivElement;
const bottomWrapper = document.getElementById('bottom-wrapper') as HTMLDivElement;
const topWrapper = document.getElementById('top-wrapper') as HTMLDivElement;
const selectWrapper = document.getElementById('camera-select-wrapper') as HTMLDivElement;
const select = document.getElementById('camera-select') as HTMLSelectElement;
const qualityWrapper = document.getElementById('quality-wrapper') as HTMLDivElement;
const quality = document.getElementById('quality') as HTMLButtonElement;
const qualityImg = document.getElementById('quality-img') as HTMLImageElement;
const accountWrapper = document.getElementById('account-wrapper') as HTMLDivElement;
const account = document.getElementById('account') as HTMLButtonElement;
const accountImg = document.getElementById('account-img') as HTMLImageElement;
const accountMenu = document.getElementById('account-menu') as HTMLDivElement;
const accountEmail = document.getElementById('account-email') as HTMLDivElement;
const openLibrary = document.getElementById('open-library') as HTMLButtonElement;
const logout = document.getElementById('logout') as HTMLButtonElement;
const loginModal = document.getElementById('login-modal') as HTMLDivElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginEmail = document.getElementById('login-email') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginError = document.getElementById('login-error') as HTMLDivElement;
const loginCancel = document.getElementById('login-cancel') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const flashWrapper = document.getElementById('flash-wrapper') as HTMLDivElement;
const flash = document.getElementById('flash') as HTMLButtonElement;
const flashImg = document.getElementById('flash-img') as HTMLImageElement;
const pastWrapper = document.getElementById('past-wrapper') as HTMLDivElement;
const past = document.getElementById('past') as HTMLDivElement;
const uploadWrapper = document.getElementById('upload-wrapper') as HTMLDivElement;
const upload = document.getElementById('upload') as HTMLInputElement;
const shutter = document.getElementById('shutter') as HTMLImageElement;
const doneWrapper = document.getElementById('done-wrapper') as HTMLDivElement;
const done = document.getElementById('done') as HTMLButtonElement;
const cameraCloseWrapper = document.getElementById('camera-close-wrapper') as HTMLDivElement;
const cameraClose = document.getElementById('camera-close') as HTMLButtonElement;
const cameraClosed = document.getElementById('camera-closed') as HTMLDivElement;
const cameraResume = document.getElementById('camera-resume') as HTMLButtonElement;
const cameraLibrary = document.getElementById('camera-library') as HTMLButtonElement;
const reviewModal = document.getElementById('review-modal') as HTMLDivElement;
const reviewImage = document.getElementById('review-image') as HTMLDivElement;
const reviewPrev = document.getElementById('review-prev') as HTMLButtonElement;
const reviewNext = document.getElementById('review-next') as HTMLButtonElement;
const reviewCounter = document.getElementById('review-counter') as HTMLDivElement;
const reviewStatus = document.getElementById('review-status') as HTMLDivElement;
const reviewClose = document.getElementById('review-close') as HTMLButtonElement;
const reviewEdit = document.getElementById('review-edit') as HTMLButtonElement;
const reviewDelete = document.getElementById('review-delete') as HTMLButtonElement;
const reviewMoveUp = document.getElementById('review-move-up') as HTMLButtonElement;
const reviewMoveDown = document.getElementById('review-move-down') as HTMLButtonElement;
const reviewGenerate = document.getElementById('review-generate') as HTMLButtonElement;
const resultModal = document.getElementById('result-modal') as HTMLDivElement;
const resultTitle = document.getElementById('result-title') as HTMLDivElement;
const resultMessage = document.getElementById('result-message') as HTMLDivElement;
const resultSave = document.getElementById('result-save') as HTMLButtonElement;
const resultRetry = document.getElementById('result-retry') as HTMLButtonElement;
const resultLibrary = document.getElementById('result-library') as HTMLButtonElement;
const resultClose = document.getElementById('result-close') as HTMLButtonElement;
const modalBottomWrapper = document.getElementById('modal-bottom-wrapper') as HTMLDivElement;
const modalCancelWrapper = document.getElementById('modal-cancel-wrapper') as HTMLDivElement;
const modalCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const modalDoneWrapper = document.getElementById('modal-done-wrapper') as HTMLDivElement;
const modalDone = document.getElementById('modal-done') as HTMLButtonElement;
type StreamHandle = {
  deviceId: string;
  close: () => void;
};

type Page = ProspectivePage & {
  img: HTMLImageElement | HTMLCanvasElement;
};

const pages: Page[] = [];

let toastTimer = -1;
const showToast = (message: string) => {
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2600) as unknown as number;
};

type PendingPdf = {
  blob: Blob;
  name: string;
};

let pendingPdf: PendingPdf | null = null;
let resultBusy = false;
const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const hideResult = () => {
  resultModal.style.display = 'none';
};

const showResult = (
  title: string,
  message: string,
  options: { canSave: boolean; canRetry: boolean; canLibrary: boolean }
) => {
  resultTitle.textContent = title;
  resultMessage.textContent = message;
  resultSave.style.display = options.canSave ? '' : 'none';
  resultRetry.style.display = options.canRetry ? '' : 'none';
  resultLibrary.style.display = options.canLibrary ? '' : 'none';
  resultModal.style.display = 'flex';
};

const savePendingPdf = async () => {
  if (!pendingPdf || resultBusy) return;
  const pdf = pendingPdf;
  resultBusy = true;
  resultSave.disabled = true;
  resultSave.textContent = '正在打开…';
  try {
    const result = await shareBlob(pdf.blob, pdf.name);
    if (result === 'shared') {
      pendingPdf = null;
      showToast('已打开分享面板');
      hideResult();
    } else if (result === 'cancelled') {
      showToast('已取消保存');
    } else if (isIOS) {
      showToast('当前 Safari 不支持保存面板，请打开资料库下载');
    } else {
      download(pdf.blob, pdf.name);
      pendingPdf = null;
      showToast('已开始下载');
      hideResult();
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '保存失败');
  } finally {
    resultBusy = false;
    resultSave.disabled = false;
    resultSave.textContent = '保存到手机';
  }
};

const uploadPendingPdf = async () => {
  if (!pendingPdf || resultBusy) return;
  const pdf = pendingPdf;
  resultBusy = true;
  resultRetry.disabled = true;
  resultRetry.textContent = '上传中…';
  try {
    showToast('正在上传到资料库…');
    const record = await uploadScan(pdf.blob, pdf.name);
    if (isIOS) {
      showResult(
        '已上传到资料库',
        'PDF 已上传。需要在手机保存一份时，点“保存到手机”，在分享面板里选“存储到文件”。',
        { canSave: true, canRetry: false, canLibrary: true }
      );
      showToast('已上传到资料库');
      return;
    }
    pendingPdf = null;
    hideResult();
    try {
      const url = await getScanDownloadUrl(record);
      openDownloadUrl(url);
      showToast('已上传到资料库，正在下载');
    } catch (err) {
      console.error(err);
      showToast('已上传到资料库，请从资料库下载');
    }
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '上传失败';
    showToast(`上传失败：${message}`);
    showResult('上传失败', `PDF 已生成，但没有上传到资料库。${message}`, {
      canSave: true,
      canRetry: true,
      canLibrary: true
    });
  } finally {
    resultBusy = false;
    resultRetry.disabled = false;
    resultRetry.textContent = '重试上传';
  }
};

const quadMaxSide = (quad: Quad) => {
  const { a, b, c, d } = quad;
  return Math.max(
    Math.hypot(a.x - b.x, a.y - b.y),
    Math.hypot(b.x - c.x, b.y - c.y),
    Math.hypot(c.x - d.x, c.y - d.y),
    Math.hypot(d.x - a.x, d.y - a.y)
  );
};

const makeScanName = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Scan ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
};

const setAccountUI = (session: Session | null) => {
  accountEmail.textContent = session?.user.email ?? '';
  accountImg.style.opacity = session ? '1' : '.55';
  account.title = session ? '账号' : '登录';
};

const closeAccountMenu = () => {
  accountMenu.style.display = 'none';
};

const closeLogin = () => {
  loginModal.style.display = 'none';
};

const openLogin = () => {
  closeAccountMenu();
  loginError.textContent = isSupabaseConfigured ? '' : CONFIG_ERROR;
  loginEmail.value = localStorage.getItem('lastEmail') || '';
  loginPassword.value = '';
  loginModal.style.display = 'flex';
  setTimeout(() => loginEmail.focus(), 0);
};

account.onclick = async (event) => {
  event.stopPropagation();
  if (!isSupabaseConfigured) {
    showToast(CONFIG_ERROR);
    return;
  }
  try {
    const session = await getSession();
    if (!session) {
      openLogin();
      return;
    }
    accountMenu.style.display = accountMenu.style.display === 'block' ? 'none' : 'block';
  } catch (err) {
    showToast(err instanceof Error ? err.message : '读取登录状态失败');
    openLogin();
  }
};

loginCancel.onclick = closeLogin;
loginModal.onclick = (event) => {
  if (event.target === loginModal) closeLogin();
};

loginForm.onsubmit = async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const submit = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  submit.disabled = true;
  submit.textContent = '登录中…';
  try {
    const session = await signIn(loginEmail.value.trim(), loginPassword.value);
    setAccountUI(session);
    localStorage.setItem('lastEmail', loginEmail.value.trim());
    closeLogin();
    showToast('登录成功');
  } catch (err) {
    loginError.textContent = err instanceof Error ? err.message : '登录失败';
  } finally {
    submit.disabled = false;
    submit.textContent = '登录';
  }
};

openLibrary.onclick = () => {
  location.href = './library.html';
};

logout.onclick = async () => {
  try {
    await signOut();
    closeAccountMenu();
    setAccountUI(null);
    showToast('已退出登录');
  } catch (err) {
    showToast(err instanceof Error ? err.message : '退出失败');
  }
};

document.addEventListener('click', (event) => {
  const target = event.target as Node;
  if (!accountMenu.contains(target) && !accountWrapper.contains(target)) {
    closeAccountMenu();
  }
});

if (isSupabaseConfigured) {
  getSession().then(setAccountUI).catch(() => setAccountUI(null));
  onAuthChange(setAccountUI);
} else {
  setAccountUI(null);
}

const log = (text: string) => {
  const el = document.createElement('div');
  el.innerText = text;
  root.appendChild(el);
}

const resizeListeners: (() => void)[] = [];

const onResize = (listener: () => void) => {
  resizeListeners.push(listener);
  return () => {
    resizeListeners.splice(resizeListeners.indexOf(listener), 1);
  };
};

const callResizeListeners = () => {
  for (const listener of resizeListeners) {
    listener();
  }
};

let rst = -1;
window.addEventListener('resize', () => {
  clearTimeout(rst);
  rst = setTimeout(callResizeListeners, 250) as unknown as number;
}, { passive: true });

const point = (a: Point, scale: number) => {
  const elem = document.createElement('div');
  const mwh = Math.min(window.innerWidth, window.innerHeight);
  elem.style.width = mwh * 0.03 + 'px';
  elem.style.height = mwh * 0.03 + 'px';
  elem.style.borderRadius = mwh * 0.015 + 'px';
  elem.style.backgroundColor = 'black';
  elem.style.position = 'absolute';
  adjustPoint(elem, a, scale);
  return elem;
};

const adjustPoint = (elem: HTMLDivElement, a: Point, scale: number) => {
  const mwh = Math.min(window.innerWidth, window.innerHeight);
  elem.style.top = a.y * scale - mwh * 0.015 + 'px';
  elem.style.left = a.x * scale - mwh * 0.015 + 'px';
};

const line = (a: Point, b: Point, scale: number) => {
  const elem = document.createElement('div');
  elem.style.height = '4px';
  elem.style.backgroundColor = 'red';
  elem.style.position = 'absolute';
  elem.style.transformOrigin = 'center left';
  adjustLine(elem, a, b, scale);
  return elem;
};

const adjustLine = (elem: HTMLDivElement, a: Point, b: Point, scale: number) => {
  elem.style.width = Math.hypot(a.x - b.x, a.y - b.y) * scale + 'px';
  elem.style.top = a.y * scale + 'px';
  elem.style.left = a.x * scale + 'px';
  elem.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
}

const preprocessPhoto = async (src: Blob | ImageBitmap): Promise<Page> => {
  let img: HTMLImageElement | HTMLCanvasElement, data: ImageData;
  if (src instanceof Blob) {
    const image = await toImage(src);
    img = image;
    data = await getData(image);
  } else {
    const cnv = document.createElement('canvas');
    cnv.width = src.width;
    cnv.height = src.height;
    cnv.getContext('2d')!.drawImage(src, 0, 0);
    img = cnv;
    data = await getData(src, true);
  }
  const quad = {
    a: { x: 0, y: data.height },
    b: { x: 0, y: 0 },
    c: { x: data.width, y: 0 },
    d: { x: data.width, y: data.height }
  };
  return { img, data, quad };
};

const processPhotos = async (srcs: (Blob | ImageBitmap | Page)[]): Promise<Page[] | null> => {
  const results = srcs.map(src => src instanceof Blob || src instanceof ImageBitmap ? preprocessPhoto(src) : src);
  const cbs: ((check: boolean) => void)[] = [];
  const confirmedPages: Page[] = [];
  let firstDimensions = { width: 0, height: 0 };
  let landscape = false;
  for (const result of results) {
    const isFirst = result == results[0];
    const { img, data, quad } = await result;
    const imgCrop = document.createElement('div');
    imgCrop.style.display = 'flex';
    imgCrop.style.justifyContent = 'center';
    imgCrop.style.alignItems = 'center';
    imgCrop.style.overflow = 'hidden';
    imgCrop.style.scrollSnapAlign = 'center';
    const imgDoc = document.createElement('div');
    imgDoc.style.position = 'relative';
    imgDoc.appendChild(img);
    imgCrop.appendChild(imgDoc);
    modal.style.display = 'flex';
    const aspectRatio = Math.max(data.width, data.height) / Math.min(data.width, data.height);
    let scale = 0, docX = 0, docY = 0, latestDims = false;
    let prevElems: HTMLDivElement[] = [];
    const getLatestDims = () => {
      if (!latestDims) {
        const { left, top } = imgDoc.getBoundingClientRect();
        docX = left;
        docY = top;
        latestDims = true; 
      }
    }
    const makePoint = (src: Point, onUpdate: () => void) => {
      const pt = point(src, scale);
      let active = false;
      const onDown = (evt: MouseEvent | TouchEvent, x: number, y: number) => {
        if (pt.parentElement == imgDoc) {
          if (evt.target == pt || (evt.target == img && Math.hypot(x - src.x * scale, y - src.y * scale) < Math.min(window.innerWidth, window.innerHeight) * 0.2)) {
            evt.stopImmediatePropagation();
            active = true;
            onMove(x, y);
          }
        } else {
          imgDoc.removeEventListener('mousedown', onMouseDown);
          imgDoc.removeEventListener('touchstart', onTouchStart);
          imgDoc.removeEventListener('mousemove', onMouseMove);
          imgDoc.removeEventListener('touchmove', onTouchMove);
          imgDoc.removeEventListener('mouseup', onUp);
          imgDoc.removeEventListener('touchend', onUp);
        }
      };
      const onMove = (x: number, y: number) => {
        src.x = x / scale;
        src.y = y / scale;
        adjustPoint(pt, src, scale);
        onUpdate();
      };
      const onUp = () => {
        active = false;
      };
      const onMouseDown = (e: MouseEvent) => {
        getLatestDims();
        onDown(e, e.pageX - docX, e.pageY - docY);
      };
      imgDoc.addEventListener('mousedown', onMouseDown);
      const onTouchStart = (e: TouchEvent) => {
        const touch = e.targetTouches[0];
        getLatestDims();
        onDown(e, touch.pageX - docX, touch.pageY - docY);
      }
      imgDoc.addEventListener('touchstart', onTouchStart);
      const onMouseMove = (e: MouseEvent) => {
        if (active) {
          e.preventDefault();
          onMove(e.pageX - docX, e.pageY - docY);
        }
      };
      imgDoc.addEventListener('mousemove', onMouseMove);
      const onTouchMove = (e: TouchEvent) => {
        if (active) {
          const touch = e.targetTouches[0];
          e.preventDefault();
          onMove(touch.pageX - docX, touch.pageY - docY);
        }
      }
      imgDoc.addEventListener('touchmove', onTouchMove);
      imgDoc.addEventListener('mouseup', onUp);
      imgDoc.addEventListener('touchend', onUp);
      return pt;
    }
    const paintLines = () => {
      for (const elem of prevElems) {
        imgDoc.removeChild(elem);
      }
      const ab = line(quad.a, quad.b, scale);
      const bc = line(quad.b, quad.c, scale);
      const cd = line(quad.c, quad.d, scale);
      const da = line(quad.d, quad.a, scale);
      prevElems = [
        imgDoc.appendChild(ab),
        imgDoc.appendChild(bc),
        imgDoc.appendChild(cd),
        imgDoc.appendChild(da),
        imgDoc.appendChild(makePoint(quad.a, () => {
          adjustLine(da, quad.d, quad.a, scale);
          adjustLine(ab, quad.a, quad.b, scale);
        })),
        imgDoc.appendChild(makePoint(quad.b, () => {
          adjustLine(ab, quad.a, quad.b, scale);
          adjustLine(bc, quad.b, quad.c, scale);
        })),
        imgDoc.appendChild(makePoint(quad.c, () => {
          adjustLine(bc, quad.b, quad.c, scale);
          adjustLine(cd, quad.c, quad.d, scale);
        })),
        imgDoc.appendChild(makePoint(quad.d, () => {
          adjustLine(cd, quad.c, quad.d, scale);
          adjustLine(da, quad.d, quad.a, scale);
        })),
      ];
    };
    const updateImageDimensions = () => {
      const { width, height } = isFirst
        ? calcDimensions(aspectRatio, 0.925, window.innerWidth, window.innerHeight)
        : firstDimensions;
      if (isFirst) {
        landscape = isLandscape(aspectRatio);
        firstDimensions = { width, height };
        const actionSize = (landscape ? window.innerWidth : window.innerHeight) * 0.035 + 'px';
        modalCancelWrapper.style.height = modalDoneWrapper.style.height = actionSize;
        modalCancelWrapper.style.margin = modalDoneWrapper.style.margin = (landscape ? window.innerWidth : window.innerHeight) * 0.02 + 'px';
        captures.style.width = modal.style.width = window.innerWidth + 'px';
        captures.style.height = modal.style.height = window.innerHeight + 'px';
        modal.style.flexDirection = landscape ? 'row' : 'column';
        captures.style.flexDirection = landscape ? 'column' : 'row';
        if (landscape) {
          modalBottomWrapper.style.flexDirection = 'column';
          modalBottomWrapper.style.height = window.innerHeight + 'px';
          modalBottomWrapper.style.width = ''; 
        } else {
          modalBottomWrapper.style.flexDirection = 'row';
          modalBottomWrapper.style.height = '';
          modalBottomWrapper.style.width = window.innerWidth + 'px';   
        }
      }
      const cssWidth = width + 'px';
      const cssHeight = height + 'px';
    
      if (landscape) {
        img.style.width = '';
        img.style.height = cssHeight;
        scale = window.innerHeight / data.height;
      } else {
        img.style.width = cssWidth;
        img.style.height = '';
        scale = window.innerWidth / data.width;
      }
      imgCrop.style.width = imgCrop.style.minWidth = cssWidth;
      imgCrop.style.height = imgCrop.style.minHeight = cssHeight;
      latestDims = false;
      paintLines();
    };
    updateImageDimensions();
    captures.appendChild(imgCrop);
    const offResize = onResize(updateImageDimensions);
    cbs.push(check => {
      if (check) {
        confirmedPages.push({ data, quad, img });
      }
      offResize();
      captures.removeChild(imgCrop);
    })
  }

  return new Promise<Page[] | null>(resolve => {
    const onDone = () => finish(true);
    const onCancel = () => finish(false);
    modalCancel.addEventListener('click', onCancel);
    modalDone.addEventListener('click', onDone);
    const finish = (check: boolean) => {
      modalDone.removeEventListener('click', onDone);
      modalCancel.removeEventListener('click', onCancel);
      modal.style.display = 'none';
      for (const cb of cbs) {
        cb(check);
      }
      resolve(check ? confirmedPages : null);
    };
  });
}

const isLandscape = (aspectRatio: number) => window.innerWidth > (window.innerHeight * aspectRatio);

const calcDimensions = (
  aspectRatio: number,
  maxRatio: number,
  availableWidth: number,
  availableHeight: number
) => {
  const landscape = availableWidth > availableHeight * aspectRatio;
  const height = landscape
    ? availableHeight
    : Math.floor(Math.min(availableWidth * aspectRatio, availableHeight * maxRatio));
  const width = landscape
    ? Math.floor(Math.min(availableHeight * aspectRatio, availableWidth * maxRatio))
    : availableWidth;
  return { width, height };
};

const sideWrappers = [topWrapper, bottomWrapper];
const topElems = [cameraCloseWrapper, flashWrapper, qualityWrapper, accountWrapper, selectWrapper, pastWrapper];
const bottomElems = [uploadWrapper];
const allElems = topElems.concat(bottomElems, doneWrapper, shutter);

let currentStream: StreamHandle | null = null;
let cameraStarting = false;
let cameraClosedByUser = false;
let generating = false;

const showCameraClosed = (visible: boolean) => {
  cameraClosed.style.display = visible ? 'flex' : 'none';
};

const makeThumbnail = (page: Page) => {
  const maxSize = 160;
  const ratio = Math.min(1, maxSize / Math.max(page.data.width, page.data.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(page.data.width * ratio));
  canvas.height = Math.max(1, Math.round(page.data.height * ratio));
  canvas.getContext('2d')!.drawImage(page.img, 0, 0, canvas.width, canvas.height);
  return canvas;
};

let reviewIndex = 0;

const updatePagesUI = () => {
  done.textContent = pages.length ? `预览 PDF · ${pages.length} 页` : '预览 PDF';
  done.disabled = pages.length === 0;
  doneWrapper.classList.toggle('disabled', pages.length === 0);
  while (pastWrapper.lastChild != past) {
    pastWrapper.removeChild(pastWrapper.lastChild!);
  }
  if (pages.length) {
    const thumb = makeThumbnail(pages[pages.length - 1]);
    thumb.style.width = '100%';
    thumb.style.height = '100%';
    thumb.style.objectFit = 'contain';
    pastWrapper.appendChild(thumb);
  }
};

const makePreview = (page: Page) => {
  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(page.data.width, page.data.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(page.data.width * ratio));
  canvas.height = Math.max(1, Math.round(page.data.height * ratio));
  canvas.getContext('2d')!.drawImage(page.img, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const renderReview = () => {
  const total = pages.length;
  if (!total) {
    closeReview();
    return;
  }
  if (reviewIndex >= total) reviewIndex = total - 1;
  if (reviewIndex < 0) reviewIndex = 0;
  reviewCounter.textContent = `第 ${reviewIndex + 1} / ${total} 页`;
  reviewImage.replaceChildren(makePreview(pages[reviewIndex]));
  reviewPrev.disabled = generating || reviewIndex === 0;
  reviewNext.disabled = generating || reviewIndex === total - 1;
  reviewMoveUp.disabled = generating || reviewIndex === 0;
  reviewMoveDown.disabled = generating || reviewIndex === total - 1;
  reviewEdit.disabled = generating;
  reviewDelete.disabled = generating;
  reviewClose.disabled = generating;
  reviewGenerate.disabled = generating;
};

const showPage = (delta: number) => {
  if (generating) return;
  const next = reviewIndex + delta;
  if (next < 0 || next >= pages.length) return;
  reviewIndex = next;
  renderReview();
};

const openReview = () => {
  if (!pages.length) {
    showToast('还没有页面，先拍一张吧');
    return;
  }
  reviewIndex = 0;
  if (!generating) reviewStatus.textContent = '';
  reviewModal.style.display = 'flex';
  renderReview();
};

const closeReview = () => {
  reviewModal.style.display = 'none';
  if (!generating) reviewStatus.textContent = '';
  reviewImage.replaceChildren();
};

const movePage = (index: number, delta: number) => {
  if (generating) return;
  const next = index + delta;
  if (next < 0 || next >= pages.length) return;
  const [page] = pages.splice(index, 1);
  pages.splice(next, 0, page);
  reviewIndex = next;
  renderReview();
  updatePagesUI();
};

const deletePage = (index: number) => {
  if (generating) return;
  pages.splice(index, 1);
  updatePagesUI();
  if (!pages.length) {
    closeReview();
    showToast('已删除全部页面');
    return;
  }
  if (reviewIndex >= pages.length) reviewIndex = pages.length - 1;
  renderReview();
  showToast('已删除本页');
};

const editPage = async (index: number) => {
  if (generating) return;
  const page = pages[index];
  if (!page) return;
  reviewModal.style.display = 'none';
  try {
    const confirmed = await processPhotos([page]);
    if (confirmed && confirmed[0]) {
      pages[index] = confirmed[0];
      reviewIndex = index;
      showToast(`已更新第 ${index + 1} 页`);
    }
  } catch (err) {
    console.error(err);
    showToast('编辑失败，请重试');
  } finally {
    if (pages.length) {
      reviewModal.style.display = 'flex';
      renderReview();
    }
    updatePagesUI();
  }
};

const generatePDF = async () => {
  if (generating || !pages.length) return;
  generating = true;
  reviewStatus.textContent = '';
  renderReview();
  try {
    const extracted: ImageData[] = [];
    for (let i = 0; i < pages.length; ++i) {
      reviewStatus.textContent = `正在生成 ${i + 1}/${pages.length}…`;
      const { data, quad } = pages[i];
      const targetWidth = Math.max(1, Math.min(2480, Math.round(quadMaxSide(quad))));
      extracted.push(await extractDocument(data, quad, targetWidth, false));
    }
    reviewStatus.textContent = '正在写入 PDF…';
    const pdfBytes = await toPDF(extracted);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const name = makeScanName();
    pendingPdf = { blob, name };
    closeReview();
    pages.length = 0;
    updatePagesUI();

    let session: Session | null = null;
    let sessionError = '';
    if (isSupabaseConfigured) {
      try {
        session = await getSession();
      } catch (err) {
        console.error(err);
        sessionError = err instanceof Error ? err.message : '读取登录状态失败';
      }
    }

    if (session) {
      await uploadPendingPdf();
    } else {
      showResult(
        'PDF 已生成',
        sessionError
          ? `读取登录状态失败：${sessionError}。可以先把 PDF 保存到手机。`
          : isSupabaseConfigured
            ? '未登录，未上传到资料库。可以先把 PDF 保存到手机，登录后可再生成并上传。'
            : 'Supabase 未配置，未上传到资料库。可以先把 PDF 保存到手机。',
        { canSave: true, canRetry: false, canLibrary: true }
      );
      showToast('PDF 已生成，请保存到手机');
    }
  } catch (err) {
    console.error(err);
    reviewStatus.textContent = '生成失败，请重试';
    showToast('生成 PDF 失败，请重试');
  } finally {
    generating = false;
    updatePagesUI();
    if (reviewModal.style.display === 'flex') renderReview();
  }
};

const startStream = async (device?: string): Promise<StreamHandle> => {
  const baseConstraints: MediaTrackConstraints = {
    facingMode: 'environment',
    width: { ideal: 100000 },
    height: { ideal: 100000 }
  };
  if (device) baseConstraints.deviceId = { exact: device };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: baseConstraints, audio: false });
  } catch (err) {
    if (!device) throw err;
    localStorage.removeItem('defaultDevice');
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 100000 },
        height: { ideal: 100000 }
      },
      audio: false
    });
  }
  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack.getSettings();
  const settingsWidth = settings.width || preview.videoWidth || 1280;
  const settingsHeight = settings.height || preview.videoHeight || 720;
  const aspectRatio = Math.max(settingsWidth, settingsHeight) / Math.min(settingsWidth, settingsHeight);

  const applyLayout = () => {
    const safeStyle = getComputedStyle(root);
    const safeTop = parseFloat(safeStyle.paddingTop) || 0;
    const safeRight = parseFloat(safeStyle.paddingRight) || 0;
    const safeBottom = parseFloat(safeStyle.paddingBottom) || 0;
    const safeLeft = parseFloat(safeStyle.paddingLeft) || 0;
    const availableWidth = Math.max(1, window.innerWidth - safeLeft - safeRight);
    const availableHeight = Math.max(1, window.innerHeight - safeTop - safeBottom);
    const landscape = availableWidth > availableHeight * aspectRatio;
    const baseSize = landscape ? availableWidth : availableHeight;
    const { width, height } = calcDimensions(aspectRatio, 0.84, availableWidth, availableHeight);
    const cssHeight = height + 'px';
    const cssWidth = width + 'px';
    previewCrop.style.width = previewCrop.style.minWidth = cssWidth;
    previewCrop.style.height = previewCrop.style.minHeight = cssHeight;
    root.style.width = window.innerWidth + 'px';
    root.style.height = window.innerHeight + 'px';
    for (const sideWrapper of sideWrappers) {
      if (landscape) {
        sideWrapper.style.flexDirection = 'column';
        sideWrapper.style.height = availableHeight + 'px';
        sideWrapper.style.width = '';
      } else {
        sideWrapper.style.flexDirection = 'row';
        sideWrapper.style.height = '';
        sideWrapper.style.width = availableWidth + 'px';
      }
    }
    for (const topElem of topElems) {
      topElem.style.width = topElem.style.height = baseSize * 0.03 + 'px';
    }
    for (const bottomElem of bottomElems) {
      bottomElem.style.width = bottomElem.style.height = baseSize * 0.035 + 'px';
    }
    for (const elem of allElems) {
      elem.style.margin = baseSize * 0.02 + 'px';
    }
    shutter.style.width = shutter.style.height = baseSize * 0.05 + 'px';
    doneWrapper.style.height = baseSize * 0.035 + 'px';
    const pastBorderSize = baseSize * 0.002 + 'px';
    pastWrapper.style.borderRadius = pastBorderSize;
    pastWrapper.style.border = pastBorderSize + ' solid white';
    if (landscape) {
      preview.style.height = cssHeight;
      preview.style.width = '';
      root.style.flexDirection = 'row';
    } else {
      preview.style.height = '';
      preview.style.width = cssWidth;
      root.style.flexDirection = 'column';
    }
  };
  applyLayout();
  const offResize = onResize(applyLayout);

  let capabilities: Partial<MediaTrackCapabilities> = {};
  try {
    capabilities = videoTrack.getCapabilities();
  } catch (err) {
    console.warn(err);
  }
  flashWrapper.style.display = capabilities.torch ? '' : 'none';

  let cap: ImageCapture | null = null;
  try {
    cap = new ImageCapture(videoTrack);
  } catch (err) {
    console.warn('ImageCapture unavailable', err);
  }
  let hd = !!cap && Object.prototype.toString.call(cap) == '[object ImageCapture]';
  qualityWrapper.style.display = hd ? '' : 'none';
  qualityImg.src = hdURL;
  const onQualityClick = () => {
    hd = !hd;
    qualityImg.src = hd ? hdURL : sdURL;
  };
  quality.addEventListener('click', onQualityClick);

  preview.srcObject = stream;
  preview.play().catch(() => {});

  const shutterFlash = () => {
    preview.style.opacity = '0';
    setTimeout(() => preview.style.opacity = '', 50);
  };
  const grabVideoFrame = () => new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    if (!canvas.width || !canvas.height) {
      reject(new Error('相机尚未准备好'));
      return;
    }
    canvas.getContext('2d')!.drawImage(preview, 0, 0);
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('拍照失败'));
    }, 'image/jpeg', 0.95);
  });
  const takePhoto = async () => {
    if (cap && hd) {
      try {
        return await cap.takePhoto();
      } catch (err) {
        console.warn('takePhoto failed, falling back to grabFrame', err);
      }
    }
    if (cap) return cap.grabFrame();
    return grabVideoFrame();
  };
  const onShutterClick = async () => {
    if (shutter.style.opacity == '') {
      shutter.style.opacity = '0.5';
      shutterFlash();
      try {
        const photo = await takePhoto();
        const page = await preprocessPhoto(photo);
        pages.push(page);
        updatePagesUI();
        showToast(`已添加第 ${pages.length} 页`);
      } catch (err) {
        console.error(err);
        showToast(err instanceof Error ? err.message : '拍照失败，请重试');
      } finally {
        shutter.style.opacity = '';
      }
    }
  };
  shutter.addEventListener('click', onShutterClick);

  let torch = false;
  flashImg.src = flashOffURL;
  const onFlashClick = async () => {
    try {
      torch = !torch;
      await videoTrack.applyConstraints({
        advanced: [{ torch }]
      });
      flashImg.src = torch ? flashURL : flashOffURL;
    } catch (err) {
      console.error(err);
      showToast('闪光灯不可用');
    }
  };
  flash.addEventListener('click', onFlashClick);

  return {
    deviceId: settings.deviceId || device || '',
    close() {
      offResize();
      shutter.removeEventListener('click', onShutterClick);
      flash.removeEventListener('click', onFlashClick);
      quality.removeEventListener('click', onQualityClick);
      preview.pause();
      preview.srcObject = null;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  };
};

const ensureStream = async (device?: string) => {
  if (cameraStarting) return currentStream;
  cameraStarting = true;
  try {
    if (currentStream) {
      currentStream.close();
      currentStream = null;
    }
    const handle = await startStream(device);
    currentStream = handle;
    cameraClosedByUser = false;
    showCameraClosed(false);
    return handle;
  } finally {
    cameraStarting = false;
  }
};

const stopCamera = (byUser: boolean) => {
  if (currentStream) {
    currentStream.close();
    currentStream = null;
  }
  preview.srcObject = null;
  if (byUser) cameraClosedByUser = true;
  showCameraClosed(true);
};

const resumeCamera = async () => {
  if (cameraStarting) return;
  showCameraClosed(false);
  try {
    await ensureStream(localStorage.getItem('defaultDevice') || undefined);
  } catch (err) {
    console.error(err);
    showCameraClosed(true);
    showToast('无法启动相机，请检查权限或使用 HTTPS 打开');
  }
};

const onLoad = async () => {
  const handle = await ensureStream(localStorage.getItem('defaultDevice') || undefined);
  if (!handle) throw new Error('相机启动失败');
  const updateBold = () => {
    for (const option of select.options) {
      option.style.fontWeight = '';
    }
    const selected = select.selectedOptions[0];
    if (selected) selected.style.fontWeight = 'bold';
  };
  for (const device of await navigator.mediaDevices.enumerateDevices()) {
    if (device.kind == 'videoinput') {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.label = device.label;
      select.appendChild(option);
    }
  }
  if (![...select.options].some(option => option.value === handle.deviceId)) {
    const option = document.createElement('option');
    option.value = handle.deviceId;
    option.label = '默认相机';
    select.appendChild(option);
  }
  select.value = handle.deviceId;
  updateBold();
  select.onchange = async () => {
    const device = select.value;
    select.disabled = true;
    localStorage.setItem('defaultDevice', device);
    try {
      await ensureStream(device);
    } catch (err) {
      console.error(err);
      showCameraClosed(true);
      showToast('切换相机失败，请点击继续扫描');
    } finally {
      select.disabled = false;
    }
  };
  upload.onchange = async () => {
    const files = upload.files ? [...upload.files] : [];
    upload.value = '';
    if (!files.length) return;
    shutter.style.opacity = '0.5';
    let added = 0;
    let failed = 0;
    try {
      for (const file of files) {
        try {
          const page = await preprocessPhoto(file);
          pages.push(page);
          added++;
          updatePagesUI();
        } catch (err) {
          console.error(err);
          failed++;
        }
      }
      if (added && failed) {
        showToast(`已添加 ${added} 页，${failed} 张失败`);
      } else if (added) {
        showToast(`已添加 ${added} 页`);
      } else {
        showToast('导入失败，请重试');
      }
    } finally {
      shutter.style.opacity = '';
    }
  };
  done.onclick = () => openReview();
  past.onclick = () => openReview();
  updatePagesUI();
};

cameraClose.onclick = () => {
  stopCamera(true);
  showToast('相机已关闭');
};
cameraResume.onclick = () => {
  resumeCamera();
};
cameraLibrary.onclick = () => {
  location.href = './library.html';
};
reviewClose.onclick = closeReview;
reviewEdit.onclick = () => editPage(reviewIndex);
reviewDelete.onclick = () => deletePage(reviewIndex);
reviewMoveUp.onclick = () => movePage(reviewIndex, -1);
reviewMoveDown.onclick = () => movePage(reviewIndex, 1);
reviewGenerate.onclick = generatePDF;
reviewPrev.onclick = () => showPage(-1);
reviewNext.onclick = () => showPage(1);
resultSave.onclick = savePendingPdf;
resultRetry.onclick = uploadPendingPdf;
resultLibrary.onclick = () => {
  pendingPdf = null;
  hideResult();
  location.href = './library.html';
};
resultClose.onclick = () => {
  pendingPdf = null;
  hideResult();
};
let touchStartX = 0;
let touchStartY = 0;
reviewImage.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1) return;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });
reviewImage.addEventListener('touchend', (event) => {
  const touch = event.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  showPage(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (currentStream) stopCamera(false);
  } else if (!currentStream && !cameraClosedByUser) {
    resumeCamera();
  }
});
window.addEventListener('pagehide', () => {
  if (currentStream) stopCamera(false);
});

const isDesktop = window.matchMedia('(pointer: fine)').matches;
const forceCamera = new URLSearchParams(location.search).has('camera');

if (isDesktop && !forceCamera) {
  location.replace('./library.html');
} else {
  onLoad().catch((err) => {
    console.error(err);
    showCameraClosed(true);
    showToast('无法启动相机，请检查权限或使用 HTTPS 打开');
  });

  if (process.env.NODE_ENV == 'production' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('./service.ts', import.meta.url), {
      type: 'module',
      scope: './'
    }).catch((err) => {
      console.error('Service worker registration failed', err);
    });
  }
}
