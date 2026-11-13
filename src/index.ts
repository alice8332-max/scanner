import { findDocument, extractDocument, Point, Quad } from './process';
import { toPDF } from './pdf';
import { toImage, getData, download } from './io';
import { ProspectivePage, getFile, setFile } from './db';
import { getSession, onAuthChange, signIn, signOut } from './lib/auth';
import { uploadScan } from './lib/scans';
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
const previewDoc = document.getElementById('preview-doc') as HTMLDivElement;
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
const reviewCount = document.getElementById('review-count') as HTMLDivElement;
const reviewList = document.getElementById('review-list') as HTMLDivElement;
const reviewStatus = document.getElementById('review-status') as HTMLDivElement;
const reviewClose = document.getElementById('review-close') as HTMLButtonElement;
const reviewContinue = document.getElementById('review-continue') as HTMLButtonElement;
const reviewGenerate = document.getElementById('review-generate') as HTMLButtonElement;
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

const preprocessPhoto = async (src: Blob | ImageBitmap) => {
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
  const quad = await findDocument(data) || {
    a: { x: 0, y: data.height },
    b: { x: 0, y: 0 },
    c: { x: data.width, y: 0 },
    d: { x: data.width, y: data.height }
  };
  const clampPoint = (a: Point) => {
    if (a.x < 0) a.x = 0;
    else if (a.x > data.width) a.x = data.width;
    if (a.y < 0) a.y = 0;
    else if (a.y > data.height) a.y = data.height;
  };
  clampPoint(quad.a);
  clampPoint(quad.b);
  clampPoint(quad.c);
  clampPoint(quad.d);
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
      const { width, height } = isFirst ? calcDimensions(aspectRatio, 0.925) : firstDimensions;
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

const calcDimensions = (aspectRatio: number, maxRatio: number) => {
  const landscape = isLandscape(aspectRatio);
  const height = landscape ? window.innerHeight : Math.floor(Math.min(window.innerWidth * aspectRatio, window.innerHeight * maxRatio));
  const width = landscape ? Math.floor(Math.min(window.innerHeight * aspectRatio, window.innerWidth * maxRatio)) : window.innerWidth;
  return { width, height };
}

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

const updatePagesUI = () => {
  done.textContent = `生成 PDF · ${pages.length} 页`;
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

const renderReview = () => {
  reviewCount.textContent = String(pages.length);
  reviewList.replaceChildren();
  reviewGenerate.disabled = pages.length === 0 || generating;
  if (!pages.length) {
    const empty = document.createElement('div');
    empty.className = 'review-empty';
    empty.textContent = '还没有页面，先拍一张吧。';
    reviewList.appendChild(empty);
    return;
  }
  pages.forEach((page, index) => {
    const item = document.createElement('div');
    item.className = 'review-page';

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'review-thumb';
    thumb.title = '重新调整四角';
    thumb.appendChild(makeThumbnail(page));
    thumb.onclick = () => editPage(index);

    const main = document.createElement('div');
    main.className = 'review-page-main';
    const title = document.createElement('div');
    title.className = 'review-page-title';
    title.textContent = `第 ${index + 1} 页`;
    const meta = document.createElement('div');
    meta.className = 'review-page-meta';
    meta.textContent = `${page.data.width} × ${page.data.height}`;

    const actions = document.createElement('div');
    actions.className = 'review-page-actions';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'review-btn';
    up.textContent = '上移';
    up.disabled = generating || index === 0;
    up.onclick = () => movePage(index, -1);
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'review-btn';
    down.textContent = '下移';
    down.disabled = generating || index === pages.length - 1;
    down.onclick = () => movePage(index, 1);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'review-btn danger';
    del.textContent = '删除';
    del.disabled = generating;
    del.onclick = () => deletePage(index);
    actions.append(up, down, del);

    main.append(title, meta, actions);
    item.append(thumb, main);
    reviewList.appendChild(item);
  });
};

const openReview = () => {
  if (!pages.length) {
    showToast('还没有页面，先拍一张吧');
    return;
  }
  if (!generating) reviewStatus.textContent = '';
  renderReview();
  reviewModal.style.display = 'flex';
};

const closeReview = () => {
  reviewModal.style.display = 'none';
  reviewStatus.textContent = '';
};

const movePage = (index: number, delta: number) => {
  if (generating) return;
  const next = index + delta;
  if (next < 0 || next >= pages.length) return;
  const [page] = pages.splice(index, 1);
  pages.splice(next, 0, page);
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
  renderReview();
  showToast('已删除该页');
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
      showToast(`已更新第 ${index + 1} 页`);
    }
  } catch (err) {
    console.error(err);
    showToast('编辑失败，请重试');
  } finally {
    if (pages.length) {
      renderReview();
      reviewModal.style.display = 'flex';
    }
    updatePagesUI();
  }
};

const generatePDF = async () => {
  if (generating || !pages.length) return;
  generating = true;
  reviewGenerate.disabled = true;
  reviewClose.disabled = true;
  reviewContinue.disabled = true;
  reviewList.style.pointerEvents = 'none';
  reviewStatus.textContent = '';
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
    download(blob, name);
    closeReview();
    pages.length = 0;
    updatePagesUI();
    showToast('已保存，正在上传…');
    if (isSupabaseConfigured) {
      try {
        const session = await getSession();
        if (session) {
          await uploadScan(blob, name);
          showToast('已上传到资料库');
        } else {
          showToast('未登录，已保存到本地');
        }
      } catch (err) {
        console.error(err);
        showToast('上传失败，已保存到本地');
      }
    } else {
      showToast('Supabase 未配置，已保存到本地');
    }
  } catch (err) {
    console.error(err);
    reviewStatus.textContent = '生成失败，请重试';
    showToast('生成 PDF 失败，请重试');
  } finally {
    generating = false;
    reviewGenerate.disabled = pages.length === 0;
    reviewClose.disabled = false;
    reviewContinue.disabled = false;
    reviewList.style.pointerEvents = '';
    updatePagesUI();
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
    const landscape = isLandscape(aspectRatio);
    const { width, height } = calcDimensions(aspectRatio, 0.84);
    const cssHeight = height + 'px';
    const cssWidth = width + 'px';
    previewCrop.style.width = previewCrop.style.minWidth = cssWidth;
    previewCrop.style.height = previewCrop.style.minHeight = cssHeight;
    root.style.width = window.innerWidth + 'px';
    root.style.height = window.innerHeight + 'px';
    for (const sideWrapper of sideWrappers) {
      if (landscape) {
        sideWrapper.style.flexDirection = 'column';
        sideWrapper.style.height = window.innerHeight + 'px';
        sideWrapper.style.width = '';
      } else {
        sideWrapper.style.flexDirection = 'row';
        sideWrapper.style.height = '';
        sideWrapper.style.width = window.innerWidth + 'px';
      }
    }
    for (const topElem of topElems) {
      topElem.style.width = topElem.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.03 + 'px';
    }
    for (const bottomElem of bottomElems) {
      bottomElem.style.width = bottomElem.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.035 + 'px';
    }
    for (const elem of allElems) {
      elem.style.margin = (landscape ? window.innerWidth : window.innerHeight) * 0.02 + 'px';
    }
    shutter.style.width = shutter.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.05 + 'px';
    doneWrapper.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.035 + 'px';
    const pastBorderSize = (landscape ? window.innerWidth : window.innerHeight) * 0.002 + 'px';
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

  let docPreviewTimeout = -1;
  let detecting = false;
  let newElems: Node[] = [];
  const clearNewElems = () => {
    for (const elem of newElems) {
      previewDoc.removeChild(elem);
    }
    newElems.length = 0;
  };

  const onMetadata = () => {
    const scale = isLandscape(aspectRatio)
      ? window.innerHeight / preview.videoHeight
      : window.innerWidth / preview.videoWidth;
    const docPreview = async () => {
      let quad: Quad | undefined;
      const ts = performance.now();
      const canDetect = !!cap && preview.videoWidth > 0 && modal.style.display == 'none' && reviewModal.style.display == 'none';
      if (canDetect && !detecting) {
        detecting = true;
        try {
          const bitmap = await cap!.grabFrame();
          const data = await getData(bitmap, true, 720);
          const found = await findDocument(data, true);
          if (found) {
            const sx = preview.videoWidth / data.width;
            const sy = preview.videoHeight / data.height;
            quad = {
              a: { x: found.a.x * sx, y: found.a.y * sy },
              b: { x: found.b.x * sx, y: found.b.y * sy },
              c: { x: found.c.x * sx, y: found.c.y * sy },
              d: { x: found.d.x * sx, y: found.d.y * sy }
            };
          }
        } catch (err) {
          console.error(err);
        } finally {
          detecting = false;
        }
      }
      clearNewElems();
      if (docPreviewTimeout != -1) {
        if (quad) {
          newElems = [
            previewDoc.appendChild(line(quad.a, quad.b, scale)),
            previewDoc.appendChild(line(quad.b, quad.c, scale)),
            previewDoc.appendChild(line(quad.c, quad.d, scale)),
            previewDoc.appendChild(line(quad.d, quad.a, scale))
          ];
        }
        docPreviewTimeout = setTimeout(docPreview, Math.max(250 - performance.now() + ts, 0)) as unknown as number;
      }
    };
    docPreviewTimeout = setTimeout(docPreview, 0) as unknown as number;
  };
  preview.addEventListener('loadedmetadata', onMetadata);
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
        const confirmed = await processPhotos([photo]);
        if (confirmed) {
          pages.push(...confirmed);
          updatePagesUI();
          showToast(`已添加第 ${pages.length} 页`);
        }
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
      clearTimeout(docPreviewTimeout);
      docPreviewTimeout = -1;
      offResize();
      shutter.removeEventListener('click', onShutterClick);
      flash.removeEventListener('click', onFlashClick);
      quality.removeEventListener('click', onQualityClick);
      preview.removeEventListener('loadedmetadata', onMetadata);
      preview.pause();
      preview.srcObject = null;
      clearNewElems();
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
    try {
      const confirmed = await processPhotos(files);
      if (confirmed) {
        pages.push(...confirmed);
        updatePagesUI();
        showToast(`已添加 ${confirmed.length} 页`);
      }
    } catch (err) {
      console.error(err);
      showToast('导入失败，请重试');
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
reviewContinue.onclick = closeReview;
reviewGenerate.onclick = generatePDF;
reviewModal.onclick = (event) => {
  if (event.target === reviewModal && !generating) closeReview();
};
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
