/* ---------- SHARED STORAGE KEYS (must match app.js) ---------- */
const AI_KEY_STORAGE = 'moa_anthropic_key';
const AI_HISTORY_KEY = 'moa_conversation_history';
const AI_BACKEND_KEY = 'moa_history_backend';
const OLLAMA_ENABLED_KEY = 'moa_use_ollama';
const OLLAMA_MODEL_KEY = 'moa_ollama_model';
const OLLAMA_URL = 'http://localhost:11434';
const AUTO_BRIEF_ENABLED_KEY = 'moa_auto_brief_enabled';
const NEWS_FEED_KEY = 'moa_news_feed';
const TIMERS_STORAGE_KEY = 'moa_timers';
const SHARED_CAL_KEY = 'aegis_calendar_events';
const DEFAULT_NEWS_FEED = 'https://moxie.foxnews.com/google-publisher/us.xml';

function setStatus(id, text, cls){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.className = 'set-status' + (cls ? ' ' + cls : '');
}

/* ---------- ANTHROPIC API KEY ---------- */
function refreshApiKeyStatus(){
  const key = localStorage.getItem(AI_KEY_STORAGE);
  if(key){
    setStatus('apiKeyStatus', `Key saved (ending ...${key.slice(-4)}). Claude is active unless local AI is enabled below.`, 'good');
  } else {
    setStatus('apiKeyStatus', 'No key saved. AI chat is off unless local AI is enabled below.');
  }
}

document.getElementById('apiKeySave').addEventListener('click', () => {
  const input = document.getElementById('apiKeyInput');
  const val = input.value.trim();
  if(!val) return;
  localStorage.setItem(AI_KEY_STORAGE, val);
  localStorage.removeItem(AI_HISTORY_KEY);
  input.value = '';
  refreshApiKeyStatus();
});

document.getElementById('aiReset').addEventListener('click', () => {
  localStorage.removeItem(AI_KEY_STORAGE);
  localStorage.removeItem(AI_HISTORY_KEY);
  refreshApiKeyStatus();
});

/* ---------- OLLAMA ---------- */
async function checkOllamaConnection(){
  const enabled = localStorage.getItem(OLLAMA_ENABLED_KEY) === 'true';
  if(!enabled){ setStatus('ollamaStatus', ''); return; }
  setStatus('ollamaStatus', 'Checking connection...');
  try{
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    const names = (data.models || []).map(m => m.name).join(', ');
    setStatus('ollamaStatus', `Connected. Available: ${names || 'none'}`, 'good');
  } catch(err){
    setStatus('ollamaStatus', 'Cannot reach Ollama on localhost:11434. Make sure it is running and OLLAMA_ORIGINS is set.', 'warn');
  }
}

document.getElementById('ollamaToggle').addEventListener('change', (e) => {
  localStorage.setItem(OLLAMA_ENABLED_KEY, e.target.checked ? 'true' : 'false');
  localStorage.removeItem(AI_HISTORY_KEY);
  localStorage.removeItem(AI_BACKEND_KEY);
  checkOllamaConnection();
  refreshApiKeyStatus();
});

document.getElementById('ollamaModelInput').addEventListener('change', (e) => {
  const val = e.target.value.trim() || 'llama3.1:8b';
  localStorage.setItem(OLLAMA_MODEL_KEY, val);
  e.target.value = val;
});

/* ---------- AUTO BRIEFING ---------- */
document.getElementById('autoBriefToggle').addEventListener('change', (e) => {
  localStorage.setItem(AUTO_BRIEF_ENABLED_KEY, e.target.checked ? 'true' : 'false');
});

/* ---------- NEWS FEED ---------- */
const newsPreset = document.getElementById('newsPreset');
const newsCustom = document.getElementById('newsCustom');

function loadNewsSetting(){
  const saved = localStorage.getItem(NEWS_FEED_KEY) || DEFAULT_NEWS_FEED;
  const match = Array.from(newsPreset.options).find(o => o.value === saved);
  if(match){
    newsPreset.value = saved;
    newsCustom.style.display = 'none';
  } else {
    newsPreset.value = 'custom';
    newsCustom.style.display = 'block';
    newsCustom.value = saved;
  }
}

newsPreset.addEventListener('change', () => {
  newsCustom.style.display = newsPreset.value === 'custom' ? 'block' : 'none';
});

document.getElementById('newsSave').addEventListener('click', () => {
  const val = newsPreset.value === 'custom' ? newsCustom.value.trim() : newsPreset.value;
  if(!val){
    setStatus('newsStatus', 'Enter a feed URL first.', 'warn');
    return;
  }
  localStorage.setItem(NEWS_FEED_KEY, val);
  setStatus('newsStatus', 'Saved. Reload the dashboard to see the new source.', 'good');
});

/* ---------- HUE LOCAL-ONLY WARNING ---------- */
function showHueContextWarning(){
  const el = document.getElementById('hueLocalWarning');
  if(!el) return;
  if(window.location.protocol === 'https:'){
    el.textContent = "Hue can't be reached over https. The bridge only accepts http requests on your local network, so this panel only works when MOA is served locally (e.g. from VS Code Live Server).";
    el.style.color = 'var(--amber)';
  } else {
    el.textContent = 'Connects to a Philips Hue bridge on your local network.';
  }
}

/* ---------- SPOTIFY DISCONNECT ---------- */
document.getElementById('spotifyDisconnect').addEventListener('click', () => {
  localStorage.removeItem('moa_spotify_tokens');
  if(typeof updateSpotifyStatus === 'function') updateSpotifyStatus();
});

/* ---------- DATA MANAGEMENT ---------- */
document.getElementById('clearChat').addEventListener('click', () => {
  localStorage.removeItem(AI_HISTORY_KEY);
  localStorage.removeItem(AI_BACKEND_KEY);
  setStatus('dataStatus', 'AI conversation memory cleared.', 'good');
});

document.getElementById('clearTimers').addEventListener('click', () => {
  localStorage.removeItem(TIMERS_STORAGE_KEY);
  setStatus('dataStatus', 'All timers and reminders cleared.', 'good');
});

document.getElementById('clearCalendar').addEventListener('click', () => {
  const count = (() => {
    try{ return (JSON.parse(localStorage.getItem(SHARED_CAL_KEY)) || []).length; }
    catch(err){ return 0; }
  })();
  if(!count){
    setStatus('dataStatus', 'No calendar events to delete.');
    return;
  }
  if(confirm(`Permanently delete all ${count} calendar event(s)? This cannot be undone.`)){
    localStorage.removeItem(SHARED_CAL_KEY);
    setStatus('dataStatus', `Deleted ${count} calendar event(s).`, 'good');
  }
});

/* ---------- INIT ---------- */
document.getElementById('ollamaToggle').checked = localStorage.getItem(OLLAMA_ENABLED_KEY) === 'true';
document.getElementById('ollamaModelInput').value = localStorage.getItem(OLLAMA_MODEL_KEY) || 'llama3.1:8b';
const autoBriefSaved = localStorage.getItem(AUTO_BRIEF_ENABLED_KEY);
document.getElementById('autoBriefToggle').checked = autoBriefSaved === null ? true : autoBriefSaved === 'true';
refreshApiKeyStatus();
checkOllamaConnection();
loadNewsSetting();
showHueContextWarning();
