(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const els = {
    targetInput: $('#targetInput'),
    targetPreview: $('#targetPreview'),
    targetPlaceholder: $('#targetPlaceholder'),
    targetStatus: $('#targetStatus'),
    apiKey: $('#apiKey'),
    sourceType: $('#sourceType'),
    sourceUrl: $('#sourceUrl'),
    sourceLabel: $('#sourceLabel'),
    fetchBtn: $('#fetchBtn'),
    stopFetchBtn: $('#stopFetchBtn'),
    metadataPanel: $('#metadataPanel'),
    metadataPercent: $('#metadataPercent'),
    metadataBar: $('#metadataBar'),
    metadataCount: $('#metadataCount'),
    metadataPages: $('#metadataPages'),
    metadataStatus: $('#metadataStatus'),
    totalCount: $('#totalCount'),
    uniqueCount: $('#uniqueCount'),
    pageCount: $('#pageCount'),
    columns: $('#columns'), columnsValue: $('#columnsValue'),
    outSize: $('#outSize'), outSizeValue: $('#outSizeValue'),
    diversity: $('#diversity'), diversityValue: $('#diversityValue'),
    blend: $('#blend'), blendValue: $('#blendValue'),
    avoidNeighbors: $('#avoidNeighbors'),
    proxyUrl: $('#proxyUrl'),
    buildBtn: $('#buildBtn'),
    stopBuildBtn: $('#stopBuildBtn'),
    buildPanel: $('#buildPanel'),
    buildTitle: $('#buildTitle'),
    buildPercent: $('#buildPercent'),
    buildBar: $('#buildBar'),
    buildCount: $('#buildCount'),
    buildErrors: $('#buildErrors'),
    buildStatus: $('#buildStatus'),
    errorBox: $('#errorBox'),
    resultArea: $('#resultArea'),
    resultCanvas: $('#resultCanvas'),
    resultInfo: $('#resultInfo'),
    shareBtn: $('#shareBtn'),
    saveBtn: $('#saveBtn'),
    clearBtn: $('#clearBtn')
  };

  const state = {
    target: null,
    targetUrl: '',
    fetchedItems: [],
    tileData: [],
    isFetching: false,
    isBuilding: false,
    stopFetch: false,
    stopBuild: false,
    resultBlob: null,
    lastFetchTotalHint: 0
  };

  function updateSliders(){
    els.columnsValue.textContent = `${els.columns.value}列`;
    els.outSizeValue.textContent = `${els.outSize.value}px`;
    els.diversityValue.textContent = `${els.diversity.value}%`;
    els.blendValue.textContent = `${els.blend.value}%`;
  }
  [els.columns, els.outSize, els.diversity, els.blend].forEach(el => el.addEventListener('input', updateSliders));
  updateSliders();

  function showError(message){
    els.errorBox.hidden = !message;
    els.errorBox.textContent = message || '';
  }

  function clearError(){ showError(''); }

  function updateButtons(){
    const hasTarget = !!state.target;
    const hasSources = state.fetchedItems.length > 1;
    els.fetchBtn.disabled = state.isFetching || state.isBuilding;
    els.stopFetchBtn.disabled = !state.isFetching;
    els.buildBtn.disabled = state.isFetching || state.isBuilding || !hasTarget || !hasSources;
    els.stopBuildBtn.disabled = !state.isBuilding;
  }

  function updateSourceSummary(){
    els.totalCount.textContent = String(state.fetchedItems.length);
    els.uniqueCount.textContent = String(state.fetchedItems.length);
    els.pageCount.textContent = String(state.lastFetchTotalHint.pages || 0);
  }

  function setMetaProgress({count=0,pages=0,percent=0,status=''}={}){
    els.metadataPanel.hidden = false;
    els.metadataPercent.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    els.metadataBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.metadataCount.textContent = `${count}件取得`;
    els.metadataPages.textContent = `${pages}ページ`;
    els.metadataStatus.textContent = status;
  }

  function setBuildProgress({title='素材の解析中', done=0, total=0, percent=0, errors=0, status=''}={}){
    els.buildPanel.hidden = false;
    els.buildTitle.textContent = title;
    els.buildPercent.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    els.buildBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.buildCount.textContent = `${done} / ${total}件`;
    els.buildErrors.textContent = `失敗 ${errors}件`;
    els.buildStatus.textContent = status;
  }

  function pause(){ return new Promise(r => setTimeout(r,0)); }

  function parseChannelInput(value){
    const raw = value.trim();
    if(!raw) return null;
    try{
      const u = new URL(raw);
      const path = u.pathname.replace(/\/+$/,'');
      if(path.startsWith('/channel/')) return { type:'id', value:path.split('/')[2] || '' };
      if(path.startsWith('/user/')) return { type:'username', value:path.split('/')[2] || '' };
      if(path.startsWith('/@')) return { type:'handle', value:path.slice(2) };
    }catch(_){
      if(raw.startsWith('@')) return { type:'handle', value:raw.slice(1) };
      if(/^UC[A-Za-z0-9_-]+$/.test(raw)) return { type:'id', value:raw };
      return { type:'username', value:raw };
    }
    return null;
  }

  function extractPlaylistId(value){
    const raw = value.trim();
    if(!raw) return '';
    try{
      const u = new URL(raw);
      return u.searchParams.get('list') || '';
    }catch(_){
      return raw;
    }
  }

  async function ytApi(url){
    const res = await fetch(url, { mode:'cors' });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.error){
      throw new Error(data?.error?.message || `APIエラー (${res.status})`);
    }
    return data;
  }

  function chooseThumb(thumbnails){
    return thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || '';
  }

  async function resolveUploadsPlaylist(apiKey, channelSpec){
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'contentDetails,snippet');
    url.searchParams.set('key', apiKey);
    if(channelSpec.type === 'id') url.searchParams.set('id', channelSpec.value);
    else if(channelSpec.type === 'handle') url.searchParams.set('forHandle', channelSpec.value);
    else url.searchParams.set('forUsername', channelSpec.value);
    const data = await ytApi(url.toString());
    const item = data.items && data.items[0];
    const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
    if(!uploads) throw new Error('uploads プレイリストを取得できませんでした。チャンネルURL / ID / @ハンドルを確認してください。');
    return { uploads, title: item?.snippet?.title || channelSpec.value };
  }

  async function fetchAllThumbItems(apiKey, type, input){
    const results = [];
    let playlistId = '';
    let title = '';
    if(type === 'channel'){
      const ch = parseChannelInput(input);
      if(!ch) throw new Error('チャンネルURL / ID / @ハンドルを入力してください。');
      const resolved = await resolveUploadsPlaylist(apiKey, ch);
      playlistId = resolved.uploads;
      title = resolved.title;
    } else {
      playlistId = extractPlaylistId(input);
      if(!playlistId) throw new Error('再生リストURL / ID を入力してください。');
      title = '再生リスト';
    }

    let pageToken = '';
    let pages = 0;
    let estimatedTotal = 0;
    state.stopFetch = false;

    while(true){
      if(state.stopFetch) break;
      pages++;
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part','snippet');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults','50');
      url.searchParams.set('key', apiKey);
      if(pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await ytApi(url.toString());
      estimatedTotal = data?.pageInfo?.totalResults || estimatedTotal;
      for(const item of data.items || []){
        const videoId = item?.snippet?.resourceId?.videoId;
        const thumb = chooseThumb(item?.snippet?.thumbnails);
        if(videoId && thumb){
          results.push({
            key: videoId,
            videoId,
            title: item?.snippet?.title || videoId,
            url: thumb
          });
        }
      }
      const finished = !data.nextPageToken;
      const percent = estimatedTotal ? Math.min(99, (results.length / estimatedTotal) * 100) : Math.min(99, pages * 3);
      setMetaProgress({
        count: results.length,
        pages,
        percent: finished ? 100 : percent,
        status: finished
          ? `${title} の取得が完了しました。`
          : `${title} から取得中… ${estimatedTotal ? `推定 ${estimatedTotal} 件中` : ''}`
      });
      state.lastFetchTotalHint = { pages, estimatedTotal };
      if(finished) break;
      pageToken = data.nextPageToken;
      await pause();
    }
    return { items: results, pages };
  }

  async function loadImageFromUrl(url){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function proxiedUrl(url){
    const proxy = els.proxyUrl.value.trim();
    if(!proxy) return url;
    const u = new URL(proxy);
    u.searchParams.set('url', url);
    return u.toString();
  }

  async function fetchThumbImage(url){
    const finalUrl = proxiedUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try{
      const res = await fetch(finalUrl, { mode:'cors', signal: controller.signal });
      if(!res.ok) throw new Error(`画像取得失敗 (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = await loadImageFromUrl(objectUrl);
      return { img, objectUrl };
    } finally {
      clearTimeout(timer);
    }
  }

  function drawCover(ctx, img, x, y, w, h){
    const sw0 = img.naturalWidth || img.width;
    const sh0 = img.naturalHeight || img.height;
    const sourceRatio = sw0 / sh0;
    const targetRatio = w / h;
    let sx = 0, sy = 0, sw = sw0, sh = sh0;
    if(sourceRatio > targetRatio){ sw = sh0 * targetRatio; sx = (sw0 - sw) / 2; }
    else { sh = sw0 / targetRatio; sy = (sh0 - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function colorDistance(a,b){
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return dr*dr*0.30 + dg*dg*0.59 + db*db*0.11;
  }

  async function buildTileData(){
    if(state.tileData.length === state.fetchedItems.length && state.tileData.length) return state.tileData;
    const thumbSize = state.fetchedItems.length > 1800 ? 36 : state.fetchedItems.length > 1200 ? 40 : state.fetchedItems.length > 700 ? 48 : 64;
    const list = [];
    let errors = 0;
    state.stopBuild = false;
    for(let i=0;i<state.fetchedItems.length;i++){
      if(state.stopBuild) throw new Error('解析を停止しました。');
      const item = state.fetchedItems[i];
      try{
        const { img, objectUrl } = await fetchThumbImage(item.url);
        const c = document.createElement('canvas');
        c.width = thumbSize; c.height = thumbSize;
        const cx = c.getContext('2d', { willReadFrequently: true });
        drawCover(cx, img, 0, 0, thumbSize, thumbSize);
        const d = cx.getImageData(0,0,thumbSize,thumbSize).data;
        let r=0,g=0,b=0,n=0;
        const stride = Math.max(4, Math.floor((thumbSize * thumbSize)/384));
        for(let p=0; p<d.length; p += stride*4){ r += d[p]; g += d[p+1]; b += d[p+2]; n++; }
        list.push({ id:item.videoId, label:item.title, src:c.toDataURL('image/jpeg',0.72), r:r/n, g:g/n, b:b/n, thumbSize });
        URL.revokeObjectURL(objectUrl);
      } catch(err){
        errors++;
      }
      setBuildProgress({
        title:'素材の解析中',
        done:i+1,
        total:state.fetchedItems.length,
        percent:((i+1)/Math.max(1,state.fetchedItems.length))*38,
        errors,
        status:`サムネイルを軽量化しています… ${i+1}/${state.fetchedItems.length}`
      });
      if(i % 3 === 0) await pause();
    }
    if(list.length < 2) throw new Error('解析できるサムネイルが2枚未満でした。Worker URL を設定して再試行してください。');
    state.tileData = list;
    return list;
  }

  async function loadThumbsForDrawing(tileData, usedIndices){
    const map = new Map();
    for(let i=0;i<usedIndices.length;i++){
      const idx = usedIndices[i];
      map.set(idx, await loadImageFromUrl(tileData[idx].src));
      setBuildProgress({
        title:'描画素材を準備中',
        done:i+1,
        total:usedIndices.length,
        percent:38 + ((i+1)/Math.max(1,usedIndices.length))*12,
        errors:0,
        status:`実際に使うサムネイルだけを読み込み中… ${i+1}/${usedIndices.length}`
      });
      if(i % 8 === 0) await pause();
    }
    return map;
  }

  function enforceMinimumUsage(cells, assignment, usage, tileData, cols){
    let forced = 0;
    if(cells.length < tileData.length) return { forced, possible:false, usedOnceCount: Math.min(cells.length, tileData.length) };
    for(let t=0;t<tileData.length;t++){
      if(usage[t] > 0) continue;
      let bestCell = -1;
      let bestPenalty = Infinity;
      for(let i=0;i<cells.length;i++){
        const current = assignment[i];
        if(current == null) continue;
        if(usage[current] <= 1) continue;
        const x = i % cols;
        const y = Math.floor(i / cols);
        if(els.avoidNeighbors.checked){
          const neighbors = [];
          if(x > 0) neighbors.push(assignment[i-1]);
          if(x < cols-1) neighbors.push(assignment[i+1]);
          if(y > 0) neighbors.push(assignment[i-cols]);
          if(y < Math.floor(cells.length / cols)+2) neighbors.push(assignment[i+cols]);
          if(neighbors.includes(t)) continue;
        }
        const penalty = colorDistance(cells[i], tileData[t]) - colorDistance(cells[i], tileData[current]);
        if(penalty < bestPenalty){
          bestPenalty = penalty;
          bestCell = i;
        }
      }
      if(bestCell >= 0){
        usage[assignment[bestCell]]--;
        assignment[bestCell] = t;
        usage[t]++;
        forced++;
      }
    }
    return { forced, possible:true, usedOnceCount: usage.filter(v => v > 0).length };
  }

  async function createMosaic(){
    clearError();
    if(!state.target) throw new Error('先に元画像を選んでください。');
    if(state.fetchedItems.length < 2) throw new Error('先にサムネイルを取得してください。');
    state.isBuilding = true;
    updateButtons();
    els.buildPanel.hidden = false;
    els.resultArea.hidden = true;
    try{
      const tileData = await buildTileData();
      const cols = Number(els.columns.value);
      const outW = Number(els.outSize.value);
      const aspect = state.target.naturalHeight / state.target.naturalWidth;
      const rows = Math.max(1, Math.round(cols * aspect));
      const outH = Math.max(1, Math.round(outW * aspect));
      const sample = document.createElement('canvas');
      sample.width = cols; sample.height = rows;
      const sc = sample.getContext('2d', { willReadFrequently: true });
      sc.drawImage(state.target, 0, 0, cols, rows);
      const px = sc.getImageData(0,0,cols,rows).data;
      const cells = [];
      for(let i=0;i<cols*rows;i++) cells.push({ r:px[i*4], g:px[i*4+1], b:px[i*4+2] });

      const assignment = new Array(cells.length);
      const usage = new Array(tileData.length).fill(0);
      const diversity = Number(els.diversity.value)/100;
      const avgUse = cells.length / tileData.length;

      for(let i=0;i<cells.length;i++){
        if(state.stopBuild) throw new Error('解析を停止しました。');
        const x = i % cols, y = Math.floor(i / cols);
        const banned = new Set();
        if(els.avoidNeighbors.checked){
          if(x > 0) banned.add(assignment[i-1]);
          if(y > 0) banned.add(assignment[i-cols]);
        }
        let best = -1, bestScore = Infinity;
        for(let t=0;t<tileData.length;t++){
          if(banned.has(t) && tileData.length > 2) continue;
          const dist = colorDistance(cells[i], tileData[t]);
          const pressure = diversity * 2600 * Math.pow(usage[t]/Math.max(1, avgUse), 1.7);
          const score = dist + pressure;
          if(score < bestScore){ bestScore = score; best = t; }
        }
        if(best < 0){
          for(let t=0;t<tileData.length;t++){
            const score = colorDistance(cells[i], tileData[t]);
            if(score < bestScore){ bestScore = score; best = t; }
          }
        }
        assignment[i] = best;
        usage[best]++;
        if(i % 160 === 0){
          setBuildProgress({
            title:'色合わせ中', done:i+1, total:cells.length,
            percent:38 + ((i+1)/Math.max(1,cells.length))*28, errors:0,
            status:`タイルに最適なサムネイルを割り当てています… ${i+1}/${cells.length}`
          });
          await pause();
        }
      }

      const minimumUsage = enforceMinimumUsage(cells, assignment, usage, tileData, cols);

      const usedIndices = Array.from(new Set(assignment)).sort((a,b) => usage[b]-usage[a]);
      const thumbs = await loadThumbsForDrawing(tileData, usedIndices);

      const canvas = els.resultCanvas;
      const ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = outW; canvas.height = outH;
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,outW,outH);
      const cw = outW / cols, ch = outH / rows;
      for(let i=0;i<assignment.length;i++){
        if(state.stopBuild) throw new Error('解析を停止しました。');
        const x = i % cols, y = Math.floor(i / cols);
        drawCover(ctx, thumbs.get(assignment[i]), x*cw, y*ch, cw+0.8, ch+0.8);
        if(i % 180 === 0){
          setBuildProgress({
            title:'描画中', done:i+1, total:assignment.length,
            percent:50 + ((i+1)/Math.max(1,assignment.length))*45, errors:0,
            status:`サムネイルを描画しています… ${i+1}/${assignment.length}`
          });
          await pause();
        }
      }
      const blend = Number(els.blend.value)/100;
      if(blend > 0){ ctx.save(); ctx.globalAlpha = blend; ctx.drawImage(state.target,0,0,outW,outH); ctx.restore(); }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
      state.resultBlob = blob;
      els.resultArea.hidden = false;
      const guaranteedText = minimumUsage.possible
        ? `全${tileData.length}素材を最低1回使用（補正 ${minimumUsage.forced}件）`
        : `タイル数不足のため ${minimumUsage.usedOnceCount}/${tileData.length} 素材を使用`;
      els.resultInfo.textContent = `${cols}×${rows} = ${cols*rows}タイル / 素材 ${tileData.length}件 / ${guaranteedText} / 出力 ${outW}×${outH}px`;
      setBuildProgress({ title:'完成', done:assignment.length, total:assignment.length, percent:100, errors:0, status:'モザイクアートが完成しました。' });
    } finally {
      state.isBuilding = false;
      updateButtons();
    }
  }

  els.targetInput.addEventListener('change', async () => {
    const file = els.targetInput.files && els.targetInput.files[0];
    if(!file) return;
    if(state.targetUrl) URL.revokeObjectURL(state.targetUrl);
    state.targetUrl = URL.createObjectURL(file);
    const img = await loadImageFromUrl(state.targetUrl);
    state.target = img;
    els.targetPreview.src = state.targetUrl;
    els.targetPreview.hidden = false;
    els.targetPlaceholder.hidden = true;
    els.targetStatus.textContent = `${file.name} — ${img.naturalWidth}×${img.naturalHeight}`;
    updateButtons();
  });

  els.sourceType.addEventListener('change', () => {
    const isChannel = els.sourceType.value === 'channel';
    els.sourceLabel.textContent = isChannel ? 'チャンネルURL / @ハンドル / UCで始まるID' : '再生リストURL / ID';
    els.sourceUrl.placeholder = isChannel ? 'https://www.youtube.com/@example' : 'https://www.youtube.com/playlist?list=...';
  });

  els.fetchBtn.addEventListener('click', async () => {
    clearError();
    const apiKey = els.apiKey.value.trim();
    const input = els.sourceUrl.value.trim();
    if(!apiKey) return showError('YouTube Data APIキーを入力してください。');
    if(!input) return showError('取得元を入力してください。');
    state.isFetching = true;
    state.stopFetch = false;
    state.fetchedItems = [];
    state.tileData = [];
    state.lastFetchTotalHint = { pages:0, estimatedTotal:0 };
    updateSourceSummary();
    updateButtons();
    try{
      setMetaProgress({ count:0, pages:0, percent:0, status:'取得を開始します…' });
      const { items, pages } = await fetchAllThumbItems(apiKey, els.sourceType.value, input);
      state.fetchedItems = items;
      state.lastFetchTotalHint.pages = pages;
      updateSourceSummary();
      setMetaProgress({
        count:items.length,
        pages,
        percent:100,
        status: state.stopFetch ? '途中で停止しました。取得済み分は利用できます。' : '取得完了。モザイク作成に進めます。'
      });
    } catch(err){
      showError(err.message || String(err));
    } finally {
      state.isFetching = false;
      updateButtons();
    }
  });

  els.stopFetchBtn.addEventListener('click', () => {
    state.stopFetch = true;
    els.metadataStatus.textContent = '停止をリクエストしました。現在のページ処理後に止まります。';
  });

  els.buildBtn.addEventListener('click', async () => {
    try { await createMosaic(); }
    catch(err){ showError(err.message || String(err)); }
  });

  els.stopBuildBtn.addEventListener('click', () => {
    state.stopBuild = true;
    els.buildStatus.textContent = '停止をリクエストしました。現在の処理が終わり次第止まります。';
  });

  els.saveBtn.addEventListener('click', () => {
    if(!state.resultBlob) return;
    const u = URL.createObjectURL(state.resultBlob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `youtube-mosaic-${new Date().toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  });

  els.shareBtn.addEventListener('click', async () => {
    if(!state.resultBlob) return;
    const file = new File([state.resultBlob], `youtube-mosaic-${new Date().toISOString().slice(0,10)}.png`, { type:'image/png' });
    if(navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share){
      try { await navigator.share({ files:[file], title:'Thumbnail Mosaic' }); }
      catch(e){ if(e?.name !== 'AbortError') console.warn(e); }
    } else {
      els.saveBtn.click();
    }
  });

  els.clearBtn.addEventListener('click', () => {
    state.stopFetch = true; state.stopBuild = true;
    state.isFetching = false; state.isBuilding = false;
    state.fetchedItems = []; state.tileData = []; state.resultBlob = null; state.lastFetchTotalHint = { pages:0, estimatedTotal:0 };
    if(state.targetUrl) URL.revokeObjectURL(state.targetUrl);
    state.target = null; state.targetUrl = '';
    els.targetInput.value = ''; els.targetPreview.src = ''; els.targetPreview.hidden = true; els.targetPlaceholder.hidden = false;
    els.targetStatus.textContent = 'まだ選ばれていません';
    els.metadataPanel.hidden = true; els.buildPanel.hidden = true; els.resultArea.hidden = true; clearError();
    updateSourceSummary(); updateButtons();
  });

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
  }

  updateSourceSummary();
  updateButtons();
})();
