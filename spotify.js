/* ---------- SPOTIFY INTEGRATION (Web API, PKCE auth) ---------- */
const SPOTIFY_CLIENT_ID_KEY = 'moa_spotify_client_id';
const SPOTIFY_TOKEN_KEY = 'moa_spotify_tokens';
const SPOTIFY_VERIFIER_KEY = 'moa_spotify_verifier';
const SPOTIFY_REDIRECT_URI = window.location.origin + window.location.pathname;

function getSpotifyClientId(){ return localStorage.getItem(SPOTIFY_CLIENT_ID_KEY); }
function setSpotifyClientId(id){ localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, id); }

function getSpotifyTokens(){
  try{
    const raw = localStorage.getItem(SPOTIFY_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(err){
    return null;
  }
}
function saveSpotifyTokens(tokens){
  localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(tokens));
}
function clearSpotifyTokens(){
  localStorage.removeItem(SPOTIFY_TOKEN_KEY);
}

/* ---------- PKCE helpers ---------- */
function generateRandomString(length){
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for(let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
async function sha256(plain){
  const data = new TextEncoder().encode(plain);
  return await window.crypto.subtle.digest('SHA-256', data);
}
function base64UrlEncode(buffer){
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- LOGIN FLOW ---------- */
async function startSpotifyLogin(){
  const clientId = getSpotifyClientId();
  if(!clientId){
    setSpotifyStatus('Enter your Spotify Client ID first.');
    return;
  }
  const verifier = generateRandomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  localStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
    code_challenge_method: 'S256',
    code_challenge: challenge
  });
  window.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleSpotifyRedirect(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if(!code) return;

  const verifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY);
  const clientId = getSpotifyClientId();
  if(!verifier || !clientId) return;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier
  });

  try{
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if(data.access_token){
      saveSpotifyTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      if(typeof logLine === 'function') logLine('Spotify connected.', 'sys');
    }
  } catch(err){
    setSpotifyStatus('Spotify login failed. Try connecting again.');
  }
}

async function refreshSpotifyToken(){
  const tokens = getSpotifyTokens();
  const clientId = getSpotifyClientId();
  if(!tokens || !tokens.refresh_token || !clientId) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId
  });

  try{
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if(data.access_token){
      const newTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000
      };
      saveSpotifyTokens(newTokens);
      return newTokens.access_token;
    }
  } catch(err){}
  return null;
}

async function getValidAccessToken(){
  const tokens = getSpotifyTokens();
  if(!tokens) return null;
  if(Date.now() > tokens.expires_at - 60000){
    return await refreshSpotifyToken();
  }
  return tokens.access_token;
}

/* ---------- API HELPERS ---------- */
async function spotifyApi(path, options = {}){
  const token = await getValidAccessToken();
  if(!token) throw new Error('Spotify not connected.');
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function spotifySearch(query){
  const res = await spotifyApi(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
  const data = await res.json();
  return data.tracks && data.tracks.items.length ? data.tracks.items[0] : null;
}

async function spotifyGetTracksByArtist(artistName, excludeId, limit = 8){
  try{
    const res = await spotifyApi(`/search?q=${encodeURIComponent('artist:' + artistName)}&type=track&limit=${limit + 1}`);
    if(!res.ok) return [];
    const data = await res.json();
    const items = (data.tracks && data.tracks.items) ? data.tracks.items : [];
    return items.filter(t => t.id !== excludeId).slice(0, limit);
  } catch(err){
    return [];
  }
}

async function spotifyQueueTrack(uri){
  try{
    await spotifyApi(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
  } catch(err){}
}

async function queueMoreFromArtist(artistName, excludeId){
  const tracks = await spotifyGetTracksByArtist(artistName, excludeId, 8);
  for(const t of tracks){
    await spotifyQueueTrack(t.uri);
  }
}

/* ---------- PLAYLISTS ---------- */
async function spotifyFindUserPlaylist(name){
  try{
    const res = await spotifyApi('/me/playlists?limit=50');
    if(!res.ok) return null;
    const data = await res.json();
    const items = data.items || [];
    const lower = name.toLowerCase();
    return items.find(p => p.name.toLowerCase().includes(lower)) || null;
  } catch(err){
    return null;
  }
}

async function spotifySearchPublicPlaylist(name){
  try{
    const res = await spotifyApi(`/search?q=${encodeURIComponent(name)}&type=playlist&limit=1`);
    if(!res.ok) return null;
    const data = await res.json();
    return (data.playlists && data.playlists.items.length) ? data.playlists.items[0] : null;
  } catch(err){
    return null;
  }
}

async function spotifyPlayPlaylist(name){
  try{
    let playlist = await spotifyFindUserPlaylist(name);
    let source = 'your';
    if(!playlist){
      playlist = await spotifySearchPublicPlaylist(name);
      source = 'a';
    }
    if(!playlist){
      return { success: false, message: `Couldn't find a playlist called "${name}".` };
    }

    const deviceId = await ensureActiveDevice();
    if(!deviceId){
      return { success: false, message: 'No Spotify device found — open Spotify on your phone or computer first, then try again.' };
    }

    const res = await spotifyApi(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ context_uri: playlist.uri })
    });
    if(res.status === 404){
      return { success: false, message: 'Spotify device disconnected — reopen Spotify and try again.' };
    }
    if(!res.ok && res.status !== 204){
      return { success: false, message: `Spotify error ${res.status}.` };
    }
    return { success: true, playlistName: playlist.name, source };
  } catch(err){
    return { success: false, message: 'Spotify is not connected.' };
  }
}

/* ---------- TOP TRACKS ("songs you play a lot") ---------- */
async function spotifyGetTopTracks(timeRange = 'medium_term', limit = 20){
  try{
    const res = await spotifyApi(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
    if(!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch(err){
    return [];
  }
}

async function spotifyPlayTopTracks(){
  try{
    const tracks = await spotifyGetTopTracks('medium_term', 20);
    if(!tracks.length){
      return { success: false, message: "Couldn't get your top tracks from Spotify. Try listening a bit more first — this needs some listening history to work from." };
    }

    const deviceId = await ensureActiveDevice();
    if(!deviceId){
      return { success: false, message: 'No Spotify device found — open Spotify on your phone or computer first, then try again.' };
    }

    const uris = tracks.map(t => t.uri);
    const res = await spotifyApi(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris })
    });
    if(res.status === 404){
      return { success: false, message: 'Spotify device disconnected — reopen Spotify and try again.' };
    }
    if(!res.ok && res.status !== 204){
      return { success: false, message: `Spotify error ${res.status}.` };
    }
    return { success: true, count: tracks.length };
  } catch(err){
    return { success: false, message: 'Spotify is not connected.' };
  }
}

async function spotifyGetDevices(){
  const res = await spotifyApi('/me/player/devices');
  const data = await res.json();
  return (data && data.devices) ? data.devices : [];
}

async function ensureActiveDevice(){
  const devices = await spotifyGetDevices();
  if(!devices.length) return null;
  const active = devices.find(d => d.is_active);
  if(active) return active.id;
  const target = devices[0];
  await spotifyApi('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [target.id], play: false })
  });
  return target.id;
}

async function spotifyPlayQuery(query){
  try{
    const track = await spotifySearch(query);
    if(!track) return { success: false, message: `Couldn't find "${query}" on Spotify.` };

    const deviceId = await ensureActiveDevice();
    if(!deviceId){
      return { success: false, message: 'No Spotify device found — open Spotify on your phone or computer first, then try again.' };
    }

    const res = await spotifyApi(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [track.uri] })
    });
    if(res.status === 404){
      return { success: false, message: 'Spotify device disconnected — reopen Spotify and try again.' };
    }
    if(!res.ok && res.status !== 204){
      return { success: false, message: `Spotify error ${res.status}.` };
    }

    const primaryArtist = track.artists && track.artists[0] ? track.artists[0].name : null;
    if(primaryArtist){
      queueMoreFromArtist(primaryArtist, track.id);
    }

    return { success: true, track: `${track.name} by ${track.artists.map(a => a.name).join(', ')}` };
  } catch(err){
    return { success: false, message: 'Spotify is not connected.' };
  }
}

async function spotifyPause(){
  try{
    const deviceId = await ensureActiveDevice();
    if(!deviceId) return false;
    const res = await spotifyApi(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
    return res.ok || res.status === 204;
  } catch(err){ return false; }
}
async function spotifyResume(){
  try{
    const deviceId = await ensureActiveDevice();
    if(!deviceId) return false;
    const res = await spotifyApi(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
    return res.ok || res.status === 204;
  } catch(err){ return false; }
}
async function spotifyNext(){
  try{
    const deviceId = await ensureActiveDevice();
    if(!deviceId) return false;
    const res = await spotifyApi(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
    return res.ok || res.status === 204;
  } catch(err){ return false; }
}
async function spotifyPrevious(){
  try{
    const deviceId = await ensureActiveDevice();
    if(!deviceId) return false;
    const res = await spotifyApi(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' });
    return res.ok || res.status === 204;
  } catch(err){ return false; }
}
async function spotifySetVolume(percent){
  const vol = Math.max(0, Math.min(100, percent));
  try{
    const deviceId = await ensureActiveDevice();
    if(!deviceId) return false;
    const res = await spotifyApi(`/me/player/volume?volume_percent=${vol}&device_id=${deviceId}`, { method: 'PUT' });
    return res.ok || res.status === 204;
  } catch(err){ return false; }
}

/* ---------- NOW PLAYING ---------- */
async function spotifyGetCurrentTrack(){
  try{
    const res = await spotifyApi('/me/player/currently-playing');
    if(res.status === 204) return null;
    if(!res.ok) return null;
    const data = await res.json();
    if(!data || !data.item) return null;
    const images = data.item.album.images || [];
    return {
      name: data.item.name,
      artist: data.item.artists.map(a => a.name).join(', '),
      art: images.length ? images[images.length - 1].url : '',
      isPlaying: data.is_playing
    };
  } catch(err){
    return null;
  }
}

async function refreshNowPlaying(){
  const widget = document.getElementById('nowPlaying');
  if(!widget) return;
  if(!getSpotifyTokens()){
    widget.style.display = 'none';
    return;
  }
  const track = await spotifyGetCurrentTrack();
  if(!track){
    widget.style.display = 'none';
    return;
  }
  widget.style.display = 'flex';
  const titleEl = document.getElementById('npTitle');
  const artistEl = document.getElementById('npArtist');
  const artEl = document.getElementById('npArt');
  const playBtn = document.getElementById('npPlayPauseBtn');
  if(titleEl) titleEl.textContent = track.name;
  if(artistEl) artistEl.textContent = track.artist;
  if(artEl) artEl.src = track.art;
  if(playBtn){
    playBtn.textContent = track.isPlaying ? '⏸' : '▶';
    playBtn.dataset.playing = track.isPlaying ? '1' : '0';
  }
}

let nowPlayingInterval = null;
function startNowPlayingPolling(){
  if(nowPlayingInterval) clearInterval(nowPlayingInterval);
  refreshNowPlaying();
  nowPlayingInterval = setInterval(refreshNowPlaying, 5000);
}

const npPlayPauseBtn = document.getElementById('npPlayPauseBtn');
const npPrevBtn = document.getElementById('npPrevBtn');
const npNextBtn = document.getElementById('npNextBtn');

if(npPlayPauseBtn){
  npPlayPauseBtn.addEventListener('click', async () => {
    if(npPlayPauseBtn.dataset.playing === '1'){
      await spotifyPause();
    } else {
      await spotifyResume();
    }
    setTimeout(refreshNowPlaying, 500);
  });
}
if(npPrevBtn){
  npPrevBtn.addEventListener('click', async () => {
    await spotifyPrevious();
    setTimeout(refreshNowPlaying, 500);
  });
}
if(npNextBtn){
  npNextBtn.addEventListener('click', async () => {
    await spotifyNext();
    setTimeout(refreshNowPlaying, 500);
  });
}

/* ---------- UI ---------- */
function setSpotifyStatus(text){
  const el = document.getElementById('spotifyStatus');
  if(el) el.textContent = text;
}

function updateSpotifyStatus(){
  const badge = document.getElementById('spotifyBadge');
  const connectRow = document.getElementById('spotifyConnect');
  const nowPlayingEl = document.getElementById('nowPlaying');
  const tokens = getSpotifyTokens();
  if(!badge || !connectRow) return;
  if(tokens){
    badge.textContent = 'Connected';
    badge.classList.add('connected');
    connectRow.style.display = 'none';
    setSpotifyStatus('Spotify connected. Try "play [song]", "pause", or "skip".');
    startNowPlayingPolling();
  } else {
    badge.textContent = 'Not connected';
    badge.classList.remove('connected');
    connectRow.style.display = 'flex';
    setSpotifyStatus('');
    if(nowPlayingEl) nowPlayingEl.style.display = 'none';
  }
}

const spotifyConnectBtn = document.getElementById('spotifyConnectBtn');
if(spotifyConnectBtn){
  spotifyConnectBtn.addEventListener('click', () => {
    const id = document.getElementById('spotifyClientId').value.trim();
    if(!id) return;
    setSpotifyClientId(id);
    startSpotifyLogin();
  });
}

const savedClientId = getSpotifyClientId();
const clientIdInput = document.getElementById('spotifyClientId');
if(savedClientId && clientIdInput) clientIdInput.value = savedClientId;

(async () => {
  await handleSpotifyRedirect();
  updateSpotifyStatus();
})();
