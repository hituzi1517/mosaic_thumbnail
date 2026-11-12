/**
 * Cloudflare Worker: public YouTube thumbnail CORS bridge.
 * No API key. No database, KV, R2, analytics, or thumbnail caching.
 * Configure ALLOWED_ORIGIN, e.g. https://example.github.io
 * Deploy as https://your-name.workers.dev ; application appends /thumb?id=VIDEO_ID.
 */
export default {
  async fetch(request, env) {
    const configuredOrigin = String(env.ALLOWED_ORIGIN || '').trim().replace(/\/+$/, '');
    if (!configuredOrigin || !/^https:\/\/[^/]+$/i.test(configuredOrigin)) {
      return new Response('Set ALLOWED_ORIGIN to the site origin, e.g. https://example.github.io', { status: 500 });
    }
    const origin = request.headers.get('Origin');
    const common = {
      'Access-Control-Allow-Origin': configuredOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    if (origin && origin !== configuredOrigin) return new Response('Not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: common });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: common });
    const url = new URL(request.url);
    if (url.pathname !== '/thumb') return new Response('Use /thumb?id=VIDEO_ID', { status: 404, headers: common });
    const id = url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return new Response('Invalid video ID', { status: 400, headers: common });
    const thumbnailUrl = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
    try {
      const upstream = await fetch(thumbnailUrl, {
        method: 'GET',
        headers: { 'Accept': 'image/jpeg' },
        cf: { cacheEverything: false, cacheTtl: 0 }
      });
      if (!upstream.ok) return new Response('Thumbnail not available', { status: upstream.status, headers: common });
      const type = upstream.headers.get('content-type') || '';
      if (!type.startsWith('image/')) return new Response('Unexpected upstream type', { status: 502, headers: common });
      // Streaming response; the Worker does not persist or buffer the image.
      return new Response(upstream.body, { status: 200, headers: { ...common, 'Content-Type': type } });
    } catch (_error) {
      return new Response('Upstream request failed', { status: 502, headers: common });
    }
  }
};
