#!/usr/bin/env node
/**
 * fetch-all.js — fetches content from all configured sources
 * Saves results to ../feeds/all-feeds.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';
import { config as loadEnv } from 'dotenv';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
loadEnv({ path: join(ROOT, '.env') });

const FEEDS_DIR = join(ROOT, 'feeds');
await mkdir(FEEDS_DIR, { recursive: true });

const sources = JSON.parse(await readFile(join(ROOT, 'config', 'sources.json'), 'utf-8'));
const YT_KEY   = process.env.YOUTUBE_API_KEY;
const X_BEARER = process.env.X_BEARER_TOKEN;

// ─── YouTube ──────────────────────────────────────────────────────────────────

async function fetchYouTubeChannel(src) {
  if (!YT_KEY) { console.warn(`[YouTube] No API key — skipping ${src.name}`); return null; }
  try {
    // Resolve handle → channel ID
    const chanRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(src.handle)}&key=${YT_KEY}`
    );
    const chan = await chanRes.json();
    if (chan.error) throw new Error(chan.error.message);
    if (!chan.items?.length) {
      console.warn(`[YouTube] Channel not found: @${src.handle}`);
      return null;
    }
    const channelId = chan.items[0].id;

    // Get latest videos
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?channelId=${channelId}&part=snippet&order=date&maxResults=3&type=video&key=${YT_KEY}`
    );
    const search = await searchRes.json();
    if (search.error) throw new Error(search.error.message);

    const videos = (search.items || []).map(v => ({
      id:          v.id.videoId,
      title:       v.snippet.title,
      description: (v.snippet.description || '').slice(0, 1500),
      publishedAt: v.snippet.publishedAt,
      url:         `https://www.youtube.com/watch?v=${v.id.videoId}`
    }));

    console.log(`[YouTube] ${src.name}: ${videos.length} video(s)`);
    return { source: 'youtube', name: src.name, handle: src.handle, category: src.category, videos };
  } catch (e) {
    console.warn(`[YouTube] Error (${src.handle}): ${e.message}`);
    return null;
  }
}

// ─── X / Twitter ──────────────────────────────────────────────────────────────

async function fetchXUser(src) {
  if (!X_BEARER) { console.warn(`[X] No bearer token — skipping ${src.name}`); return null; }
  try {
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${src.handle}?user.fields=description`,
      { headers: { Authorization: `Bearer ${X_BEARER}` } }
    );
    const user = await userRes.json();
    if (user.errors || !user.data) {
      console.warn(`[X] User not found: @${src.handle}`);
      return null;
    }

    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${user.data.id}/tweets` +
      `?max_results=5&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
      { headers: { Authorization: `Bearer ${X_BEARER}` } }
    );
    const tweets = await tweetsRes.json();

    const items = (tweets.data || []).map(t => ({
      id:        t.id,
      text:      t.text,
      createdAt: t.created_at,
      url:       `https://x.com/${src.handle}/status/${t.id}`,
      likes:     t.public_metrics?.like_count || 0
    }));

    console.log(`[X] ${src.name}: ${items.length} tweet(s)`);
    return { source: 'x', name: src.name, handle: src.handle, bio: user.data.description || '', category: src.category, tweets: items };
  } catch (e) {
    console.warn(`[X] Error (${src.handle}): ${e.message}`);
    return null;
  }
}

// ─── RSS (podcasts + newsletters) ─────────────────────────────────────────────

async function fetchRSS(src) {
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'MyDigest/1.0 (+https://github.com)' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml  = await res.text();
    const data = await parseStringPromise(xml, { explicitArray: false });

    const channel = data.rss?.channel || data.feed;
    if (!channel) throw new Error('No channel element in RSS');

    const raw   = channel.item || channel.entry || [];
    const list  = Array.isArray(raw) ? raw : [raw];

    const items = list.slice(0, 2).map(item => {
      const rawDesc = item.description
        || item['content:encoded']
        || (typeof item.content === 'object' ? item.content._ : item.content)
        || (typeof item.summary === 'object' ? item.summary._ : item.summary)
        || '';

      const url = typeof item.link === 'object'
        ? (item.link?.$ ? item.link.$.href : item.link?._ || '')
        : (item.link || '');

      return {
        title:       (typeof item.title === 'object' ? item.title._ : item.title) || '',
        description: rawDesc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000),
        pubDate:     item.pubDate || item.published || item.updated || '',
        url
      };
    });

    console.log(`[RSS] ${src.name}: ${items.length} item(s)`);
    return { source: src.type, name: src.name, category: src.category, items };
  } catch (e) {
    console.warn(`[RSS] Error (${src.name}): ${e.message}`);
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const out = {
  youtube:   [],
  x:         [],
  rss:       [],
  fetchedAt: new Date().toISOString()
};

for (const s of sources.youtube || []) {
  const d = await fetchYouTubeChannel(s);
  if (d) out.youtube.push(d);
}

for (const s of sources.x || []) {
  const d = await fetchXUser(s);
  if (d) out.x.push(d);
}

for (const s of sources.rss || []) {
  const d = await fetchRSS(s);
  if (d) out.rss.push(d);
}

const outPath = join(FEEDS_DIR, 'all-feeds.json');
await writeFile(outPath, JSON.stringify(out, null, 2));
console.log(`\nSaved → ${outPath}`);
console.log(`Total: ${out.youtube.length} YouTube, ${out.x.length} X, ${out.rss.length} RSS`);
