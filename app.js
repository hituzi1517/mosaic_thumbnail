(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('中断しました', 'AbortError'));
    const t = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(t); reject(new DOMException('中断しました', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
  });

  const els = {
    targetInput: $('targetInput'), targetZone: $('targetZone'), targetPreview: $('targetPreview'), targetPlaceholder: $('targetPlaceholder'), targetStatus: $('targetStatus'),
    apiKey: $('apiKey'), sourceType: $('sourceType'), sourceUrl: $('sourceUrl'), sourceLabel: $('sourceLabel'),
    fetchBtn: $('fetchBtn'), stopFetchBtn: $('stopFetchBtn'), metadataPanel: $('metadataPanel'), metadataPercent: $('metadataPercent'), metadataBar: $('metadataBar'), metadataCount: $('metadataCount'), metadataPages: $('metadataPages'), metadataStatus: $('metadataStatus'),
    totalCount: $('totalCount'), uniqueCount: $('uniqueCount'), pageCount: $('pageCount'),
    columns: $('columns'), columnsValue: $('columnsValue'), outSize: $('outSize'), outSizeValue: $('outSizeValue'), diversity: $('diversity'), diversityValue: $('diversityValue'), blend: $('blend'), blendValue: $('blendValue'), avoidNeighbors: $('avoidNeighbors'),
    proxyUrl: $('proxyUrl'), buildBtn: $('buildBtn'), stopBuildBtn: $('stopBuildBtn'), buildPanel: $('buildPanel'), buildTitle: $('buildTitle'), buildPercent: $('buildPercent'), buildBar: $('buildBar'), buildCount: $('buildCount'), buildErrors: $('buildErrors'), buildStatus: $('buildStatus'), errorBox: $('errorBox'),
    resultArea: $('resultArea'), resultCanvas: $('resultCanvas'), resultInfo: $('resultInfo'), shareBtn: $('shareBtn'), saveBtn: $('saveBtn'), clearBtn: $('clearBtn')
  };

  const state = {
    target: null, targetUrl: null, targetImage: null,
    entries: [], ids: new Set(), rawCount: 0, pages: 0,
    active: null, lastScan: null,
    thumbs: new Map(), failedThumbs: new Set(), thumbFetchConfig: '',
    outputReady: false
  };

  function showError(message) {
    els.errorBox.textContent = message;
    els.errorBox.hidden = false;
  }
  function hideError() { els.errorBox.hidden = true; els.errorBox.textContent = ''; }
  function isActive() { return !!state.active; }
  function setButtons() {
    const running = isActive();
    const isFetch = state.active?.name === 'metadata';
    const isBuild = state.active?.name === 'build';
    els.fetchBtn.disabled = running;
    els.stopFetchBtn.disabled = !isFetch;
    els.buildBtn.disabled = running || !state.targetImage || state.entries.length === 0;
    els.stopBuildBtn.disabled = !isBuild;
    els.clearBtn.disabled = running;
    els.targetInput.disabled = running;
    els.apiKey.disabled = running;
    els.sourceUrl.disabled = running;
    els.sourceType.disabled = running;
    els.proxyUrl.disabled = running;
  }
  function updateSummary() {
    els.totalCount.textContent = fmt(state.rawCount);
    els.uniqueCount.textContent = fmt(state.entries.length);
    els.pageCount.textContent = fmt(state.pages);
    setButtons();
  }
  function setMetaProgress(done, expected, pages, complete, message) {
    els.metadataPanel.hidden = false;
    const valid = Number.isFinite(expected) && expected > 0;
    const pct = complete ? 100 : valid ? Math.min(99, Math.floor(done / expected * 100)) : 0;
    els.metadataBar.style.width = `${pct}%`;
    els.metadataPercent.textContent = valid || complete ? `${pct}%` : '集計中';
    els.metadataCount.textContent = valid ? `${fmt(done)} / 約${fmt(expected)}件` : `${fmt(done)}件取得`;
    els.metadataPages.textContent = `${fmt(pages)}ページ`;
    els.metadataStatus.textContent = message || '';
  }
  function setBuildProgress(phase, done, total, errors, message, start, span) {
    els.buildPanel.hidden = false;
    const fraction = total ? done / total : 0;
    const pct = clamp(Math.floor(start + fraction * span), 0, 100);
    els.buildTitle.textContent = phase;
    els.buildBar.style.width = `${pct}%`;
    els.buildPercent.textContent = `${pct}%`;
    els.buildCount.textContent = `${fmt(done)} / ${fmt(total)}件`;
    els.buildErrors.textContent = `失敗 ${fmt(errors)}件`;
    els.buildStatus.textContent = message || '';
  }

  function sourceModeChanged() {
    const channel = els.sourceType.value === 'channel';
    els.sourceLabel.textContent = channel ? 'チャンネルURL / @ハンドル / UCで始まるID' : '再生リストURL / ID';
    els.sourceUrl.placeholder = channel ? 'https://www.youtube.com/@example' : 'https://www.youtube.com/playlist?list=PL...';
  }

  function updateRanges() {
    els.columnsValue.textContent = `${els.columns.value}列`;
    els.outSizeValue.textContent = `${els.outSize.value}px`;
    els.diversityValue.textContent = `${els.diversity.value}%`;
    els.blendValue.textContent = `${els.blend.value}%`;
  }

  function openImage(url, signal) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const cleanup = () => { img.onload = null; img.onerror = null; signal?.removeEventListener('abort', onAbort); };
      const onAbort = () => {
        if (settled) return;
        settled = true; img.src = ''; cleanup(); reject(new DOMException('中断しました', 'AbortError'));
      };
      img.onload = () => { if (settled) return; settled = true; cleanup(); resolve(img); };
      img.onerror = () => { if (settled) return; settled = true; cleanup(); reject(new Error('画像を読み込めませんでした')); };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      img.src = url;
    });
  }

  async function selectTarget() {
    const file = els.targetInput.files?.[0];
    if (!file || isActive()) return;
    hideError();
    const nextUrl = URL.createObjectURL(file);
    try {
      const img = await openImage(nextUrl);
      if (state.targetUrl) URL.revokeObjectURL(state.targetUrl);
      state.target = file;
      state.targetUrl = nextUrl;
      state.targetImage = img;
      els.targetPreview.src = nextUrl;
      els.targetPreview.hidden = false;
      els.targetPlaceholder.hidden = true;
      els.targetStatus.textContent = `${file.name} ・ ${img.naturalWidth} × ${img.naturalHeight}px`;
      state.outputReady = false;
      els.resultArea.hidden = true;
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      showError(`元画像を読み込めませんでした。別のJPEG/PNG画像を試してください。${error?.message || ''}`);
    }
    setButtons();
  }

  function normalizeChannel(text) {
    const v = text.trim();
    if (!v) throw new Error('チャンネルURLまたは@ハンドルを入力してください。');
    let token = v;
    if (/^https?:\/\//i.test(v)) {
      let u;
      try { u = new URL(v); } catch { throw new Error('URLを確認してください。'); }
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) throw new Error('YouTubeのチャンネルURLを入力してください。');
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0]?.startsWith('@')) token = parts[0];
      else if (parts[0] === 'channel' && parts[1]) token = parts[1];
      else if (parts[0] === 'user' && parts[1]) token = `user:${parts[1]}`;
      else throw new Error('/c/形式などはAPIで直接解決できません。@ハンドルか /channel/UC... のURLを使ってください。');
    }
    if (token.startsWith('@') && /^@[\w.-]{2,100}$/.test(token)) return { key: `handle:${token.slice(1).toLowerCase()}`, field: 'forHandle', value: token.slice(1) };
    if (/^UC[A-Za-z0-9_-]{22}$/.test(token)) return { key: `id:${token}`, field: 'id', value: token };
    if (token.startsWith('user:') && /^[A-Za-z0-9_-]{1,100}$/.test(token.slice(5))) return { key: token.toLowerCase(), field: 'forUsername', value: token.slice(5) };
    throw new Error('チャンネルは @ハンドル、UCで始まる24文字のID、またはそのURLで指定してください。');
  }

  function normalizePlaylist(text) {
    const v = text.trim();
    if (!v) throw new Error('再生リストURLまたはIDを入力してください。');
    let id = v;
    if (/^https?:\/\//i.test(v)) {
      let u;
      try { u = new URL(v); } catch { throw new Error('再生リストURLを確認してください。'); }
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) throw new Error('YouTubeの再生リストURLを入力してください。');
      id = u.searchParams.get('list') || '';
    }
    if (!/^[A-Za-z0-9_-]{12,}$/.test(id)) throw new Error('再生リストURLまたはIDを確認してください。');
    return { key: `playlist:${id}`, playlist: id };
  }

  function youtubeUrl(path, params, apiKey) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set('key', apiKey);
    return url.toString();
  }
  async function youtubeGet(path, params, key, signal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(youtubeUrl(path, params, key), { signal, cache: 'no-store' });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && !data.error) return data;
      const reason = data?.error?.errors?.[0]?.reason || '';
      const description = data?.error?.message || `HTTP ${resp.status}`;
      if ((resp.status >= 500 || resp.status === 429) && attempt < 2) { await sleep(650 * (2 ** attempt), signal); continue; }
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YouTube APIの割り当て上限に達しました。取得済みの動画一覧は残っています。');
      if (reason === 'keyInvalid' || reason === 'accessNotConfigured') throw new Error('APIキーが無効、またはYouTube Data API v3が有効になっていません。');
      throw new Error(`YouTube APIエラー: ${description}`);
    }
    throw new Error('YouTube APIに接続できません。');
  }

  async function getUploadsPlaylist(spec, key, signal) {
    const data = await youtubeGet('channels', { part: 'contentDetails,snippet', [spec.field]: spec.value }, key, signal);
    const channel = data.items?.[0];
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error('チャンネルが見つかりません。@ハンドルまたはチャンネルIDを確認してください。');
    return { playlist: uploads, name: channel?.snippet?.title || spec.value };
  }

  function mergePage(items) {
    for (const item of items) {
      state.rawCount++;
      const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId) || state.ids.has(videoId)) continue;
      if (item?.snippet?.title === 'Deleted video' || item?.snippet?.title === 'Private video') continue;
      const title = item?.snippet?.title || videoId;
      state.ids.add(videoId);
      state.entries.push({ id: videoId, title });
    }
    updateSummary();
  }

  async function fetchAllMetadata() {
    if (isActive()) return;
    hideError();
    const key = els.apiKey.value.trim();
    if (!key) return showError('YouTube Data APIキーを入力してください。');
    let spec;
    try { spec = els.sourceType.value === 'channel' ? normalizeChannel(els.sourceUrl.value) : normalizePlaylist(els.sourceUrl.value); }
    catch (error) { return showError(error.message); }

    const controller = new AbortController();
    state.active = { name: 'metadata', controller };
    setButtons();
    els.metadataPanel.hidden = false;
    let done = 0, total = 0, pages = 0;
    let current = state.lastScan?.key === spec.key && !state.lastScan?.complete ? state.lastScan : null;
    try {
      if (!current) {
        const details = spec.playlist ? { playlist: spec.playlist, name: '再生リスト' } : await getUploadsPlaylist(spec, key, controller.signal);
        current = { key: spec.key, playlist: details.playlist, name: details.name, token: '', complete: false, visited: new Set(), processed: 0, total: 0, pages: 0 };
        state.lastScan = current;
      }
      done = current.processed; total = current.total; pages = current.pages;
      setMetaProgress(done, total, pages, false, `「${current.name}」の一覧を取得しています。`);
      while (!current.complete) {
        if (controller.signal.aborted) throw new DOMException('中断しました', 'AbortError');
        const tokenId = current.token || '(first)';
        if (current.visited.has(tokenId)) throw new Error('ページ送りが循環したため停止しました。');
        const params = { part: 'snippet,contentDetails', playlistId: current.playlist, maxResults: 50 };
        if (current.token) params.pageToken = current.token;
        const data = await youtubeGet('playlistItems', params, key, controller.signal);
        if (controller.signal.aborted) throw new DOMException('中断しました', 'AbortError');
        current.visited.add(tokenId);
        const items = data.items || [];
        mergePage(items);
        current.processed += items.length;
        current.pages++;
        state.pages++;
        current.total = Math.max(current.total, Number(data.pageInfo?.totalResults || 0));
        current.token = data.nextPageToken || '';
        if (!current.token) current.complete = true;
        done = current.processed; total = current.total; pages = current.pages;
        setMetaProgress(done, total, pages, current.complete, current.complete ? `「${current.name}」の取得が完了しました。` : `「${current.name}」取得中 ・ ${fmt(state.entries.length)}件が利用可能`);
        await nextFrame();
      }
    } catch (error) {
      const stopped = error?.name === 'AbortError';
      setMetaProgress(done, total, pages, false, stopped ? `停止しました。取得済みの ${fmt(state.entries.length)}件は利用できます。同じURLで再開できます。` : `途中まで取得しました。取得済み素材は利用できます。`);
      if (!stopped) showError(error.message || String(error));
    } finally {
      state.active = null;
      updateSummary();
    }
  }

  function getProxyBase() {
    const value = els.proxyUrl.value.trim();
    if (!value) return '';
    let url;
    try { url = new URL(value); } catch { throw new Error('Worker URLの形式を確認してください。'); }
    if (url.protocol !== 'https:') throw new Error('Worker URLはhttps://から始まるアドレスを入力してください。');
    return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\/thumb$/, '')}`;
  }
  function getThumbnailUrl(id, base) {
    if (!base) return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
    return `${base}/thumb?id=${encodeURIComponent(id)}`;
  }

  async function imageToTinyRecord(blob, id, signal, size) {
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await openImage(objUrl, signal);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const context = c.getContext('2d', { willReadFrequently: true });
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const side = Math.min(sw, sh);
      context.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count++;
      }
      r /= count; g /= count; b /= count;
      // Reduced images only; original JPEG bytes are discarded.
      const src = c.toDataURL('image/jpeg', 0.72);
      c.width = c.height = 0;
      return { id, src, vec: [r * 0.548, g * 0.768, b * 0.332] };
    } finally { URL.revokeObjectURL(objUrl); }
  }

  async function downloadThumb(entry, proxyBase, signal, size) {
    const url = getThumbnailUrl(entry.id, proxyBase);
    // Each thumbnail has its own timeout so one failed request cannot stall the batch forever.
    const task = new AbortController();
    let timedOut = false;
    const stopTask = () => task.abort();
    const timer = setTimeout(() => { timedOut = true; task.abort(); }, 18000);
    if (signal.aborted) stopTask();
    else signal.addEventListener('abort', stopTask, { once: true });
    try {
      const resp = await fetch(url, { signal: task.signal, mode: 'cors', cache: 'no-store' });
      if (!resp.ok) throw new Error(`画像取得 HTTP ${resp.status}`);
      const mime = resp.headers.get('content-type') || '';
      if (!mime.startsWith('image/')) throw new Error('画像以外のデータが返りました');
      const blob = await resp.blob();
      if (blob.size > 8_000_000) throw new Error('画像が大きすぎます');
      return await imageToTinyRecord(blob, entry.id, signal, size);
    } catch (error) {
      if (signal.aborted) throw new DOMException('中断しました', 'AbortError');
      if (timedOut) throw new Error('画像読み込みがタイムアウトしました');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', stopTask);
    }
  }

  function buildKDTree(items, depth = 0) {
    if (!items.length) return null;
    const axis = depth % 3;
    items.sort((a, b) => a.vec[axis] - b.vec[axis]);
    const mid = items.length >> 1;
    return {
      record: items[mid], axis,
      left: buildKDTree(items.slice(0, mid), depth + 1),
      right: buildKDTree(items.slice(mid + 1), depth + 1)
    };
  }
  function sqDistance(a, b) { let d = 0; for (let i = 0; i < 3; i++) d += (a[i] - b[i]) ** 2; return d; }
  function nearestCandidates(root, vector, k) {
    const best = [];
    function add(record, distance) {
      let lo = 0, hi = best.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (best[mid].distance < distance) lo = mid + 1; else hi = mid; }
      best.splice(lo, 0, { record, distance });
      if (best.length > k) best.pop();
    }
    function walk(node) {
      if (!node) return;
      const diff = vector[node.axis] - node.record.vec[node.axis];
      const first = diff <= 0 ? node.left : node.right;
      const second = diff <= 0 ? node.right : node.left;
      walk(first);
      const dist = sqDistance(vector, node.record.vec);
      if (best.length < k || dist < best[best.length - 1].distance) add(node.record, dist);
      if (best.length < k || diff * diff < best[best.length - 1].distance) walk(second);
    }
    walk(root);
    return best;
  }

  function chooseAssignments(thumbs, signal) {
    const target = state.targetImage;
    const cols = Number(els.columns.value);
    const aspect = target.naturalHeight / target.naturalWidth;
    const rows = clamp(Math.round(cols * aspect), 1, 260);
    const sample = document.createElement('canvas');
    sample.width = cols; sample.height = rows;
    const sc = sample.getContext('2d', { willReadFrequently: true });
    sc.drawImage(target, 0, 0, cols, rows);
    const pixels = sc.getImageData(0, 0, cols, rows).data;
    sample.width = sample.height = 0;

    const root = buildKDTree(thumbs.slice());
    const assignments = new Array(cols * rows);
    const usage = new Map();
    const avgUse = assignments.length / thumbs.length;
    const diversity = Number(els.diversity.value) / 100;
    for (let i = 0; i < assignments.length; i++) {
      if (i % 200 === 0 && signal.aborted) throw new DOMException('中断しました', 'AbortError');
      const pixel = i * 4;
      const vec = [pixels[pixel] * 0.548, pixels[pixel + 1] * 0.768, pixels[pixel + 2] * 0.332];
      const near = nearestCandidates(root, vec, Math.min(32, thumbs.length));
      const left = i % cols ? assignments[i - 1] : null;
      const above = i >= cols ? assignments[i - cols] : null;
      let best = null, score = Infinity;
      for (const candidate of near) {
        const id = candidate.record.id;
        if (els.avoidNeighbors.checked && near.length > 2 && (id === left || id === above)) continue;
        const used = usage.get(id) || 0;
        const balance = diversity * 1200 * ((used / Math.max(1, avgUse)) ** 1.4);
        const value = candidate.distance + balance;
        if (value < score) { best = id; score = value; }
      }
      if (!best) best = near[0].record.id;
      assignments[i] = best;
      usage.set(best, (usage.get(best) || 0) + 1);
    }
    return { assignments, cols, rows, usage };
  }

  function drawCover(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  async function paintMosaic(selection, signal) {
    const { cols, rows, assignments, usage } = selection;
    const target = state.targetImage;
    let outWidth = Number(els.outSize.value);
    let outHeight = Math.round(outWidth * target.naturalHeight / target.naturalWidth);
    // iOS Canvas memory budget: cap to 9 megapixels without changing aspect ratio.
    const pixelArea = outWidth * outHeight;
    if (pixelArea > 9_000_000) {
      const scale = Math.sqrt(9_000_000 / pixelArea);
      outWidth = Math.max(1, Math.round(outWidth * scale));
      outHeight = Math.max(1, Math.round(outHeight * scale));
    }
    const canvas = els.resultCanvas;
    canvas.width = outWidth; canvas.height = outHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#08101e'; ctx.fillRect(0, 0, outWidth, outHeight);
    const grouped = new Map();
    assignments.forEach((id, index) => {
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(index);
    });
    const ordered = Array.from(grouped.keys());
    let position = 0;
    for (const id of ordered) {
      if (signal.aborted) throw new DOMException('中断しました', 'AbortError');
      const record = state.thumbs.get(id);
      const img = await openImage(record.src, signal);
      for (const index of grouped.get(id)) {
        const x = index % cols, y = Math.floor(index / cols);
        const w = outWidth / cols, h = outHeight / rows;
        drawCover(ctx, img, x * w, y * h, w + 0.45, h + 0.45);
      }
      img.src = '';
      position++;
      if (position % 8 === 0 || position === ordered.length) {
        setBuildProgress('モザイクを描画中', position, ordered.length, state.failedThumbs.size,
          `画像の保存用に描画中 ・ 使用サムネイル ${fmt(ordered.length)}件`, 78, 22);
        await nextFrame();
      }
    }
    const blend = Number(els.blend.value) / 100;
    if (blend > 0) {
      ctx.globalAlpha = blend;
      ctx.drawImage(target, 0, 0, outWidth, outHeight);
      ctx.globalAlpha = 1;
    }
    els.resultInfo.textContent = `${fmt(cols)} × ${fmt(rows)} = ${fmt(cols * rows)}タイル / ${fmt(thumbsCount())}枚を解析 / ${fmt(usage.size)}種類のサムネイルを使用 / ${fmt(outWidth)} × ${fmt(outHeight)}px`;
    els.resultArea.hidden = false;
    state.outputReady = true;
    els.resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function thumbsCount() { return state.thumbs.size; }

  async function build() {
    if (isActive() || !state.targetImage || !state.entries.length) return;
    hideError();
    let proxyBase;
    try { proxyBase = getProxyBase(); } catch (error) { return showError(error.message); }
    const controller = new AbortController();
    const signal = controller.signal;
    state.active = { name: 'build', controller };
    setButtons();
    els.buildPanel.hidden = false;
    els.resultArea.hidden = true;
    state.outputReady = false;
    try {
      if (proxyBase !== state.thumbFetchConfig) {
        state.failedThumbs.clear();
        state.thumbFetchConfig = proxyBase;
      }
      const entries = state.entries;
      const size = entries.length > 5000 ? 40 : entries.length > 1200 ? 48 : 64;
      let done = 0, failures = 0, consecutiveFailures = 0;
      // Test one remote thumbnail before attempting thousands of downloads.
      const trialEntries = entries.filter(entry => !state.thumbs.has(entry.id)).slice(0, 4);
      if (trialEntries.length) {
        setBuildProgress('画像への接続を確認', 0, entries.length, 0, 'サムネイルをCanvasで扱えるか確認中…', 0, 75);
        let trialSucceeded = false, lastError = null;
        for (const entry of trialEntries) {
          try {
            const record = await downloadThumb(entry, proxyBase, signal, size);
            state.thumbs.set(entry.id, record);
            trialSucceeded = true;
            break;
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            lastError = error;
          }
        }
        if (!trialSucceeded && !state.thumbs.size) {
          if (!proxyBase) throw new Error('YouTubeのサムネイルを直接読み込めませんでした。CORSによる制限の可能性があります。READMEに従って画像中継Workerを配置し、URLを入力してください。');
          throw new Error(`画像中継Worker経由の読み込みに失敗しました。URLとALLOWED_ORIGIN設定を確認してください。詳細: ${lastError?.message || '不明なエラー'}`);
        }
      }
      for (let i = 0; i < entries.length; i++) {
        if (signal.aborted) throw new DOMException('中断しました', 'AbortError');
        const entry = entries[i];
        if (!state.thumbs.has(entry.id)) {
          try {
            const record = await downloadThumb(entry, proxyBase, signal, size);
            state.thumbs.set(entry.id, record);
            state.failedThumbs.delete(entry.id);
            consecutiveFailures = 0;
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            failures++;
            consecutiveFailures++;
            state.failedThumbs.add(entry.id);
            if (consecutiveFailures >= 8 && state.thumbs.size < 3)
              throw new Error('画像取得が連続して失敗しました。Worker URL、ネットワーク、YouTube側の画像取得制限を確認してください。');
          }
        }
        done++;
        if (i % 3 === 0 || i + 1 === entries.length) {
          setBuildProgress('サムネイルを解析中', done, entries.length, failures,
            `${fmt(state.thumbs.size)}件解析完了 ・ 端末内の小さなサムネイルに変換して保持しています。`, 0, 72);
          await nextFrame();
        }
      }
      if (state.thumbs.size < 2) throw new Error('利用できるサムネイルが2枚未満でした。');
      setBuildProgress('色を比較して配置中', 0, 1, failures, 'サムネイルを色順に検索できるよう整理しています。', 72, 6);
      await nextFrame();
      const selection = chooseAssignments(Array.from(state.thumbs.values()).filter(record => state.ids.has(record.id)), signal);
      await nextFrame();
      setBuildProgress('色を比較して配置中', 1, 1, failures, '各マスの素材が決まりました。', 72, 6);
      await paintMosaic(selection, signal);
      setBuildProgress('完成', 1, 1, failures, `完成しました。利用可能素材 ${fmt(state.thumbs.size)}件、使用 ${fmt(selection.usage.size)}種類。`, 0, 100);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setBuildProgress('停止', state.thumbs.size, state.entries.length, state.failedThumbs.size,
          `処理を中断しました。解析済みの ${fmt(state.thumbs.size)}件は画面内に残り、再開時に再利用されます。`, 0, 72);
      } else {
        showError(error?.message || String(error));
        setBuildProgress('処理が中断されました', state.thumbs.size, state.entries.length, state.failedThumbs.size,
          `解析済みの ${fmt(state.thumbs.size)}件はこの画面を閉じるまで保持します。`, 0, 72);
      }
    } finally { state.active = null; setButtons(); }
  }

  async function outputBlob() {
    if (!state.outputReady) throw new Error('先にモザイクアートを作成してください。');
    const result = await new Promise(resolve => els.resultCanvas.toBlob(resolve, 'image/png'));
    if (!result) throw new Error('PNGを作成できませんでした。画像サイズを下げてください。');
    return result;
  }
  async function downloadResult() {
    try {
      const blob = await outputBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `thumbnail-mosaic-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4500);
    } catch (error) { showError(error.message); }
  }
  async function shareResult() {
    try {
      const blob = await outputBlob();
      const file = new File([blob], `thumbnail-mosaic-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: 'Thumbnail Mosaic' }); }
        catch (error) { if (error?.name !== 'AbortError') showError(error.message); }
      } else await downloadResult();
    } catch (error) { showError(error.message); }
  }

  function clearAll() {
    if (isActive()) return;
    if (state.targetUrl) URL.revokeObjectURL(state.targetUrl);
    state.targetUrl = null; state.target = null; state.targetImage = null;
    state.entries.length = 0; state.ids.clear(); state.rawCount = 0; state.pages = 0;
    state.lastScan = null; state.thumbs.clear(); state.failedThumbs.clear(); state.thumbFetchConfig = '';
    state.outputReady = false;
    els.targetInput.value = ''; els.apiKey.value = ''; els.sourceUrl.value = ''; els.proxyUrl.value = '';
    els.targetPreview.removeAttribute('src'); els.targetPreview.hidden = true; els.targetPlaceholder.hidden = false;
    els.targetStatus.textContent = 'まだ選ばれていません';
    els.metadataPanel.hidden = true; els.buildPanel.hidden = true; els.resultArea.hidden = true;
    els.resultCanvas.width = els.resultCanvas.height = 1;
    hideError(); updateSummary();
  }

  els.targetInput.addEventListener('change', selectTarget);
  els.sourceType.addEventListener('change', sourceModeChanged);
  for (const id of ['columns', 'outSize', 'diversity', 'blend']) els[id].addEventListener('input', updateRanges);
  els.fetchBtn.addEventListener('click', fetchAllMetadata);
  els.stopFetchBtn.addEventListener('click', () => state.active?.name === 'metadata' && state.active.controller.abort());
  els.buildBtn.addEventListener('click', build);
  els.stopBuildBtn.addEventListener('click', () => state.active?.name === 'build' && state.active.controller.abort());
  els.clearBtn.addEventListener('click', clearAll);
  els.shareBtn.addEventListener('click', shareResult);
  els.saveBtn.addEventListener('click', downloadResult);
  updateRanges(); sourceModeChanged(); updateSummary();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
