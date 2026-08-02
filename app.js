/* ---------- WEATHER (live, via Open-Meteo, no API key needed) ---------- */
let liveWeather = null;
const FALLBACK_COORDS = { lat: 40.9584, lon: -75.9746, name: "Hazleton, PA" };

const WX_CODES = {
  0:"Clear", 1:"Mostly clear", 2:"Partly cloudy", 3:"Overcast",
  45:"Fog", 48:"Fog",
  51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle",
  61:"Light rain", 63:"Rain", 65:"Heavy rain",
  71:"Light snow", 73:"Snow", 75:"Heavy snow",
  80:"Rain showers", 81:"Rain showers", 82:"Violent showers",
  95:"Thunderstorm", 96:"Thunderstorm", 99:"Thunderstorm"
};
function wxText(code){ return WX_CODES[code] || "Unknown"; }

function getLocation(){
  return new Promise(resolve => {
    if(!navigator.geolocation){ resolve(FALLBACK_COORDS); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Your location" }),
      () => resolve(FALLBACK_COORDS),
      { timeout: 5000 }
    );
  });
}

async function fetchWeather(){
  const btn = document.getElementById('wxRefresh');
  btn.classList.add('spinning');
  document.getElementById('wxLoc').textContent = 'Locating...';
  try{
    const loc = await getLocation();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('weather fetch failed');
    const data = await res.json();

    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const daily = data.daily.time.slice(0,7).map((dateStr, i) => ({
      d: days[new Date(dateStr).getDay()],
      h: Math.round(data.daily.temperature_2m_max[i]),
      l: Math.round(data.daily.temperature_2m_min[i]),
      p: Math.round(data.daily.precipitation_probability_max[i] || 0)
    }));

    liveWeather = {
      temp: Math.round(data.current.temperature_2m),
      cond: wxText(data.current.weather_code),
      daily,
      locName: loc.name
    };
    renderWeather();
  } catch(err){
    document.getElementById('wxCond').textContent = 'Unavailable';
    document.getElementById('wxLoc').textContent = 'Could not load live weather.';
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderWeather(){
  if(!liveWeather) return;
  document.getElementById('wxTemp').textContent = liveWeather.temp + '°';
  document.getElementById('wxCond').textContent = liveWeather.cond;
  const today = liveWeather.daily[0];
  document.getElementById('wxHilo').textContent = `H:${today.h}° L:${today.l}°`;
  document.getElementById('wxLoc').textContent = liveWeather.locName + ' · via Open-Meteo';

  const strip = document.getElementById('wxStrip');
  strip.innerHTML = liveWeather.daily.map(d => `
    <div class="wx-day">
      <div class="d">${d.d}</div>
      <div class="h">${d.h}°</div>
      <div class="l">${d.l}°</div>
      <div class="p">${d.p}%</div>
    </div>`).join('');
}

/* ---------- NEWS (live, via NPR RSS through rss2json, no key needed) ---------- */
let liveNews = [];
const NEWS_FEED_KEY = 'moa_news_feed';
const DEFAULT_NEWS_FEED = 'https://moxie.foxnews.com/google-publisher/us.xml';
function getNewsFeed(){ return localStorage.getItem(NEWS_FEED_KEY) || DEFAULT_NEWS_FEED; }

async function fetchNews(){
  const btn = document.getElementById('newsRefresh');
  btn.classList.add('spinning');
  try{
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(getNewsFeed())}`;
    const res = await fetch(url);
    const data = await res.json();
    if(data.status !== 'ok' || !data.items) throw new Error('news fetch failed');
    const feedTitle = (data.feed && data.feed.title) ? data.feed.title : 'News';
    liveNews = data.items.slice(0, 6).map(it => ({
      h: it.title,
      s: feedTitle,
      link: it.link
    }));
    renderNews();
  } catch(err){
    document.getElementById('newsList').innerHTML = '<div class="news-empty">Couldn\'t load live headlines right now. Try Refresh in a moment.</div>';
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderNews(){
  const list = document.getElementById('newsList');
  if(!liveNews.length){
    list.innerHTML = '<div class="news-empty">No headlines available.</div>';
    return;
  }
  list.innerHTML = liveNews.map(n => `
    <div class="news-item">
      <a class="news-headline" href="${n.link}" target="_blank" rel="noopener">${n.h}</a>
      <div class="news-src">${n.s}</div>
    </div>`).join('');
}

/* ---------- SMART HOME (demo fallback + real Hue when connected) ---------- */
const demoDevices = [
  {id:'living', name:'Living room lights', on:false},
  {id:'bedroom', name:'Bedroom lights', on:false},
  {id:'desk', name:'Desk lamp', on:false},
];

function getDeviceList(){
  if(typeof hueConnected !== 'undefined' && hueConnected){
    return Object.values(hueLights);
  }
  return demoDevices;
}

function renderDevices(){
  const wrap = document.getElementById('devices');
  const list = getDeviceList();
  wrap.innerHTML = list.map(d => `
    <div class="device-row">
      <div class="device-name"><span class="dot ${d.on?'on':''}"></span>${d.name}</div>
      <div class="switch ${d.on?'on':''}" data-id="${d.id}"><div class="switch-knob"></div></div>
    </div>`).join('');
  wrap.querySelectorAll('.switch').forEach(sw => {
    sw.addEventListener('click', () => toggleDevice(sw.dataset.id));
  });
}

async function toggleDevice(id, forceState){
  if(typeof hueConnected !== 'undefined' && hueConnected){
    const dev = hueLights[id];
    if(!dev) return;
    const newState = forceState !== undefined ? forceState : !dev.on;
    try{
      await setHueLightState(id, newState);
    } catch(err){
      logLine('Could not reach the Hue bridge. Check your network.', 'sys');
    }
    renderDevices();
    return;
  }
  const dev = demoDevices.find(d => d.id === id);
  if(!dev) return;
  dev.on = forceState !== undefined ? forceState : !dev.on;
  renderDevices();
}

function setThermostat(val){
  const slider = document.getElementById('thermSlider');
  slider.value = val;
  document.getElementById('thermVal').textContent = val + '°F';
}

/* ---------- CALENDAR TOOLS (shared by both AI backends) ---------- */
const SHARED_CAL_KEY = 'aegis_calendar_events';

function loadCalendarEvents(){
  try{
    const raw = localStorage.getItem(SHARED_CAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(err){
    return [];
  }
}
function saveCalendarEventsList(list){
  localStorage.setItem(SHARED_CAL_KEY, JSON.stringify(list));
}
function refreshCalendarViewIfOpen(){
  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderUpcoming === 'function') renderUpcoming();
}

function toolAddCalendarEvent(input){
  const list = loadCalendarEvents();
  const eventData = {
    id: 'ev_' + Date.now(),
    date: input.date,
    time: input.time || '',
    title: input.title,
    notes: input.notes || ''
  };
  list.push(eventData);
  saveCalendarEventsList(list);
  refreshCalendarViewIfOpen();
  logLine(`Calendar updated: added "${eventData.title}" on ${eventData.date}${eventData.time ? ' at ' + eventData.time : ''}.`, 'sys');
  return { success: true, event: eventData };
}

function toolGetCalendarEvents(input){
  const list = loadCalendarEvents();
  const today = new Date();
  today.setHours(0,0,0,0);
  const pad = n => String(n).padStart(2,'0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayKey = keyOf(today);
  const scope = input.scope || 'upcoming';
  let filtered;

  if(scope === 'today'){
    filtered = list.filter(e => e.date === todayKey);
  } else if(scope === 'tomorrow'){
    const t = new Date(today); t.setDate(t.getDate()+1);
    filtered = list.filter(e => e.date === keyOf(t));
  } else if(scope === 'week'){
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate()+7);
    filtered = list.filter(e => e.date >= todayKey && e.date < keyOf(weekEnd));
  } else {
    filtered = list.filter(e => e.date >= todayKey).slice(0, 10);
  }
  filtered = filtered.sort((a,b) => (a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  return { events: filtered };
}

/* ---------- AI CHAT (Claude API) ---------- */
const AI_KEY_STORAGE = 'moa_anthropic_key';
const AI_MODEL = 'claude-haiku-4-5-20251001';
const AI_HISTORY_KEY = 'moa_conversation_history';
const AI_BACKEND_KEY = 'moa_history_backend';

function loadConversationHistory(){
  try{
    const savedBackend = localStorage.getItem(AI_BACKEND_KEY);
    const currentBackend = getOllamaEnabled() ? 'ollama' : 'claude';
    // Tool-call formats differ between backends, so don't reuse history across them.
    if(savedBackend && savedBackend !== currentBackend) return [];
    const raw = localStorage.getItem(AI_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(err){
    return [];
  }
}

function saveConversationHistory(){
  try{
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(conversationHistory));
    localStorage.setItem(AI_BACKEND_KEY, getOllamaEnabled() ? 'ollama' : 'claude');
  } catch(err){}
}

function clearConversationHistory(){
  conversationHistory = [];
  localStorage.removeItem(AI_HISTORY_KEY);
  localStorage.removeItem(AI_BACKEND_KEY);
}

let conversationHistory = [];

function currentDateTimeString(){
  const now = new Date();
  return now.toLocaleString([], {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function buildSystemPrompt(){
  return `You are MOA, a helpful personal HUD assistant embedded in someone's home dashboard. The current date and time is ${currentDateTimeString()} — always use this as "today" and calculate other dates relative to it; never guess or rely on your training data for what today's date is. You have tools to add and look up events on the user's real calendar — use them whenever asked to schedule, add, or check something on the calendar, and always express dates in YYYY-MM-DD format. Keep replies conversational and fairly brief since they're sometimes read aloud by text-to-speech. Weather, news, lights, and the thermostat are handled by separate dashboard commands, not by you directly — if asked about those, tell the user to just ask directly (e.g. 'what's the weather').`;
}

const CLAUDE_TOOLS = [
  {
    name: 'add_calendar_event',
    description: "Add an event to the user's calendar.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Event date in YYYY-MM-DD format.' },
        time: { type: 'string', description: 'Event time in 24-hour HH:MM format. Omit if no specific time.' },
        title: { type: 'string', description: 'Short title of the event.' },
        notes: { type: 'string', description: 'Optional additional details.' }
      },
      required: ['date', 'title']
    }
  },
  {
    name: 'get_calendar_events',
    description: "Look up the user's existing calendar events.",
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['today','tomorrow','week','upcoming'], description: 'Which events to retrieve.' }
      },
      required: ['scope']
    }
  }
];

function getApiKey(){
  return localStorage.getItem(AI_KEY_STORAGE);
}
function saveApiKey(key){
  localStorage.setItem(AI_KEY_STORAGE, key);
}
function clearApiKey(){
  localStorage.removeItem(AI_KEY_STORAGE);
}

function updateAiStatus(){
  const status = document.getElementById('aiStatus');
  if(!status) return;
  const key = getApiKey();
  const useOllama = getOllamaEnabled();
  if(useOllama){
    status.innerHTML = 'AI chat active via local Ollama. <a href="settings.html" style="color:var(--cyan);">Settings</a>';
  } else if(key){
    status.innerHTML = 'AI chat active. <a href="settings.html" style="color:var(--cyan);">Settings</a>';
  } else {
    status.innerHTML = 'AI chat off — <a href="settings.html" style="color:var(--cyan);">enable it in Settings</a>';
  }
}

async function askClaude(userText){
  const apiKey = getApiKey();
  if(!apiKey) return null;

  conversationHistory.push({ role: 'user', content: userText });
  if(conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

  try{
    let finalText = '';
    let loopGuard = 0;

    while(loopGuard < 4){
      loopGuard++;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 400,
          system: buildSystemPrompt(),
          tools: CLAUDE_TOOLS,
          messages: conversationHistory
        })
      });

      if(!res.ok){
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody && errBody.error ? errBody.error.message : `API error ${res.status}`);
      }

      const data = await res.json();
      conversationHistory.push({ role: 'assistant', content: data.content });

      const toolUses = data.content.filter(b => b.type === 'tool_use');
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
      if(textBlocks) finalText = textBlocks;

      if(data.stop_reason === 'tool_use' && toolUses.length){
        const toolResults = toolUses.map(tu => {
          let result;
          if(tu.name === 'add_calendar_event') result = toolAddCalendarEvent(tu.input);
          else if(tu.name === 'get_calendar_events') result = toolGetCalendarEvents(tu.input);
          else result = { error: 'Unknown tool' };
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) };
        });
        conversationHistory.push({ role: 'user', content: toolResults });
        continue;
      }
      break;
    }

    saveConversationHistory();
    return finalText || 'Done.';
  } catch(err){
    conversationHistory.pop();
    return `I couldn't reach Claude: ${err.message}`;
  }
}

/* ---------- AI CHAT: LOCAL (Ollama, free) ---------- */
const OLLAMA_ENABLED_KEY = 'moa_use_ollama';
const OLLAMA_MODEL_KEY = 'moa_ollama_model';
const OLLAMA_URL = 'http://localhost:11434';

function getOllamaEnabled(){ return localStorage.getItem(OLLAMA_ENABLED_KEY) === 'true'; }
function setOllamaEnabled(val){ localStorage.setItem(OLLAMA_ENABLED_KEY, val ? 'true' : 'false'); }
function getOllamaModel(){ return localStorage.getItem(OLLAMA_MODEL_KEY) || 'llama3.1:8b'; }
function setOllamaModel(name){ localStorage.setItem(OLLAMA_MODEL_KEY, name); }

async function checkOllama(){
  const statusEl = document.getElementById('ollamaStatus');
  if(!statusEl) return;
  if(!getOllamaEnabled()){ statusEl.textContent = ''; return; }
  statusEl.textContent = 'Checking connection...';
  try{
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    statusEl.textContent = `Connected — ${data.models.length} model(s) available locally.`;
  } catch(err){
    statusEl.textContent = 'Cannot reach Ollama on localhost:11434 — is it running, and is OLLAMA_ORIGINS set?';
  }
}

const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: "Add an event to the user's calendar.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Event date in YYYY-MM-DD format.' },
          time: { type: 'string', description: 'Event time in 24-hour HH:MM format. Omit if no specific time.' },
          title: { type: 'string', description: 'Short title of the event.' },
          notes: { type: 'string', description: 'Optional additional details.' }
        },
        required: ['date', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_events',
      description: "Look up the user's existing calendar events.",
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['today','tomorrow','week','upcoming'], description: 'Which events to retrieve.' }
        },
        required: ['scope']
      }
    }
  }
];

async function askOllama(userText){
  const model = getOllamaModel();
  conversationHistory.push({ role: 'user', content: userText });
  if(conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...conversationHistory
  ];

  try{
    let finalText = '';
    let loopGuard = 0;

    while(loopGuard < 4){
      loopGuard++;
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools: OLLAMA_TOOLS, stream: false })
      });
      if(!res.ok) throw new Error(`Ollama error ${res.status}`);
      const data = await res.json();
      const msg = data.message || {};
      messages.push(msg);

      if(msg.tool_calls && msg.tool_calls.length){
        for(const call of msg.tool_calls){
          let args = call.function.arguments;
          if(typeof args === 'string'){
            try{ args = JSON.parse(args); } catch(e){ args = {}; }
          }
          let result;
          if(call.function.name === 'add_calendar_event') result = toolAddCalendarEvent(args);
          else if(call.function.name === 'get_calendar_events') result = toolGetCalendarEvents(args);
          else result = { error: 'Unknown tool' };
          messages.push({ role: 'tool', content: JSON.stringify(result) });
        }
        continue;
      }
      finalText = msg.content || finalText;
      break;
    }

    conversationHistory.push({ role: 'assistant', content: finalText });
    saveConversationHistory();
    return finalText || 'Done.';
  } catch(err){
    conversationHistory.pop();
    return `I couldn't reach Ollama: ${err.message}. Make sure it's running and OLLAMA_ORIGINS is set to allow this page.`;
  }
}

/* ---------- TIMERS & REMINDERS ---------- */
const TIMERS_STORAGE_KEY = 'moa_timers';
let timers = loadTimers();

function loadTimers(){
  try{
    const raw = localStorage.getItem(TIMERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(err){ return []; }
}
function saveTimers(){
  localStorage.setItem(TIMERS_STORAGE_KEY, JSON.stringify(timers));
}

function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, delay) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }, delay);
    };
    playTone(880, 0);
    playTone(1046, 400);
  } catch(err){}
}

function formatCountdown(ms){
  if(ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if(h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function renderTimers(){
  const list = document.getElementById('timersList');
  if(!list) return;
  if(!timers.length){
    list.innerHTML = '<div class="news-empty">No active timers. Try "set a timer for 10 minutes."</div>';
    return;
  }
  const sorted = [...timers].sort((a, b) => a.endTime - b.endTime);
  list.innerHTML = sorted.map(t => `
    <div class="timer-item">
      <div>
        <div class="timer-label">${t.message ? t.message : 'Timer'}</div>
        <div class="timer-sub">${t.message ? 'Reminder' : 'Timer'}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="timer-countdown">${formatCountdown(t.endTime - Date.now())}</div>
        <span class="timer-cancel" data-id="${t.id}">Cancel</span>
      </div>
    </div>`).join('');
  list.querySelectorAll('.timer-cancel').forEach(el => {
    el.addEventListener('click', () => cancelTimer(el.dataset.id));
  });
}

function cancelTimer(id){
  timers = timers.filter(t => t.id !== id);
  saveTimers();
  renderTimers();
}

function cancelAllTimers(){
  timers = [];
  saveTimers();
  renderTimers();
  logLine('All timers cleared.', 'sys');
}

function addTimer(durationMs, message){
  const t = {
    id: 'tm_' + Date.now() + Math.random().toString(36).slice(2, 6),
    endTime: Date.now() + durationMs,
    message: message || null
  };
  timers.push(t);
  saveTimers();
  renderTimers();
  return t;
}

function fireTimer(t){
  timers = timers.filter(x => x.id !== t.id);
  saveTimers();
  beep();
  const msg = t.message ? `Reminder: ${t.message}` : 'Your timer is done.';
  logLine(msg, 'sys');
  speak(msg);
}

function tickTimers(){
  const now = Date.now();
  const due = timers.filter(t => t.endTime <= now);
  due.forEach(fireTimer);
  renderTimers();
}

function parseDurationMs(text){
  let totalMs = 0;
  const hourMatch = text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i);
  const minMatch = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  const secMatch = text.match(/(\d+)\s*(?:seconds?|secs?|s)\b/i);
  if(hourMatch) totalMs += parseInt(hourMatch[1]) * 3600000;
  if(minMatch) totalMs += parseInt(minMatch[1]) * 60000;
  if(secMatch) totalMs += parseInt(secMatch[1]) * 1000;
  return totalMs;
}

function parseAbsoluteTimeMs(text){
  const m = text.match(/\bat\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)?\b/i);
  if(!m) return null;
  let hour = parseInt(m[1]);
  const min = m[3] ? parseInt(m[3]) : 0;
  const ampm = m[4] ? m[4].toLowerCase() : null;
  if(ampm === 'pm' && hour < 12) hour += 12;
  if(ampm === 'am' && hour === 12) hour = 0;
  if(!ampm && hour >= 1 && hour <= 7) hour += 12;
  const target = new Date();
  target.setHours(hour, min, 0, 0);
  if(target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime() - Date.now();
}

/* ---------- AUTO MORNING BRIEFING ---------- */
const AUTO_BRIEF_ENABLED_KEY = 'moa_auto_brief_enabled';
const AUTO_BRIEF_LAST_KEY = 'moa_auto_brief_last';

function getAutoBriefEnabled(){
  const val = localStorage.getItem(AUTO_BRIEF_ENABLED_KEY);
  return val === null ? true : val === 'true';
}
function setAutoBriefEnabled(val){
  localStorage.setItem(AUTO_BRIEF_ENABLED_KEY, val ? 'true' : 'false');
}

function todayKeyString(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function maybeRunAutoBriefing(){
  if(!getAutoBriefEnabled()) return;
  const hour = new Date().getHours();
  // Only in the morning window, and only once per calendar day.
  if(hour < 4 || hour >= 12) return;
  if(localStorage.getItem(AUTO_BRIEF_LAST_KEY) === todayKeyString()) return;

  // Wait for weather and news to be ready before speaking.
  let waited = 0;
  while((!liveWeather || !liveNews.length) && waited < 10000){
    await new Promise(r => setTimeout(r, 500));
    waited += 500;
  }
  if(!liveWeather || !liveNews.length) return;

  localStorage.setItem(AUTO_BRIEF_LAST_KEY, todayKeyString());
  logLine('Good morning — here is your daily briefing.', 'sys');
  showBriefing();
}

/* ---------- CLOCK ---------- */
function updateClock(){
  const now = new Date();
  document.getElementById('clockTime').textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  document.getElementById('clockDate').textContent = now.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
  const hr = now.getHours();
  const part = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
  document.getElementById('greeting').innerHTML = `Good ${part}. <b>All systems nominal.</b> Ask me for the weather, the news, or tell me to control a light.`;
}

/* ---------- WAKE WORD ("Okay MOA") ---------- */
const WAKE_ENABLED_KEY = 'moa_wake_enabled';
const WAKE_PHRASE = /\b(ok(ay)?|hey|hi)\s+moa[,]?\s*/i;
let wakeRecognizer = null;
let wakeShouldRun = false;
let commandCaptureActive = false;

function getWakeEnabled(){ return localStorage.getItem(WAKE_ENABLED_KEY) === 'true'; }
function setWakeEnabled(val){ localStorage.setItem(WAKE_ENABLED_KEY, val ? 'true' : 'false'); }

function setWakeStatus(text){
  document.getElementById('wakeStatus').textContent = text;
}

function startWakeListening(){
  if(!SpeechRec){ setWakeStatus('Voice unsupported in this browser.'); return; }
  if(commandCaptureActive) return;
  wakeShouldRun = true;

  wakeRecognizer = new SpeechRec();
  wakeRecognizer.continuous = true;
  wakeRecognizer.interimResults = true;
  wakeRecognizer.lang = 'en-US';

  wakeRecognizer.onstart = () => {
    orb.classList.add('standby');
    setWakeStatus('Listening for "Okay MOA"...');
  };

  wakeRecognizer.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    const transcript = last[0].transcript;
    if(WAKE_PHRASE.test(transcript)){
      const remainder = transcript.replace(WAKE_PHRASE, '').trim();
      try{ wakeRecognizer.stop(); } catch(err){}
      orb.classList.remove('standby');
      if(remainder){
        handleCommand(remainder);
        // resumeWake happens automatically via onend below
      } else {
        captureCommandAfterWake();
      }
    }
  };

  wakeRecognizer.onerror = (e) => {
    // 'no-speech' and similar are normal during continuous listening; just let onend restart it
  };

  wakeRecognizer.onend = () => {
    orb.classList.remove('standby');
    if(wakeShouldRun && !commandCaptureActive){
      setTimeout(() => { if(wakeShouldRun) startWakeListening(); }, 300);
    }
  };

  try{
    wakeRecognizer.start();
  } catch(err){
    setTimeout(() => { if(wakeShouldRun) startWakeListening(); }, 500);
  }
}

function stopWakeListening(){
  wakeShouldRun = false;
  orb.classList.remove('standby');
  if(wakeRecognizer){
    try{ wakeRecognizer.stop(); } catch(err){}
  }
  setWakeStatus('');
}

function captureCommandAfterWake(){
  if(!SpeechRec) return;
  commandCaptureActive = true;
  setWakeStatus('Heard "Okay MOA" — go ahead.');
  try{ recognizer.start(); } catch(err){ commandCaptureActive = false; resumeWakeIfNeeded(); }
}

function resumeWakeIfNeeded(){
  commandCaptureActive = false;
  if(wakeShouldRun){
    setTimeout(() => { if(wakeShouldRun) startWakeListening(); }, 400);
  } else {
    setWakeStatus('');
  }
}

document.getElementById('wakeToggle').addEventListener('change', (e) => {
  setWakeEnabled(e.target.checked);
  if(e.target.checked){
    startWakeListening();
  } else {
    stopWakeListening();
  }
});

/* ---------- COMMAND LOG + VOICE ---------- */
const logEl = document.getElementById('log');
function logLine(text, cls){
  const ts = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  const line = document.createElement('div');
  line.className = 'log-line ' + (cls || '');
  line.innerHTML = `<span class="ts">${ts}</span>${text}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function speak(text){
  if('speechSynthesis' in window){
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }
}

function handleCommand(raw){
  const cmd = raw.trim();
  if(!cmd) return;
  logLine(cmd, 'user');

  const c = cmd.toLowerCase();
  let reply = null;

  if(c.includes('briefing') || c.includes('brief me') || c.includes('sitrep')){
    showBriefing();
    return;
  } else if(c.includes('weather')){
    if(liveWeather){
      const d = liveWeather.daily[0];
      reply = `Currently ${liveWeather.temp} degrees and ${liveWeather.cond.toLowerCase()} near ${liveWeather.locName}. Today's high is ${d.h}, low ${d.l}, with a ${d.p} percent chance of precipitation.`;
    } else {
      reply = "Still loading live weather. One moment.";
      fetchWeather();
    }
  } else if(c.includes('news') || c.includes('headline')){
    if(liveNews.length){
      reply = 'Top story: ' + liveNews[0].h + (liveNews[1] ? ' Also: ' + liveNews[1].h : '');
    } else {
      reply = "Still loading headlines. One moment.";
      fetchNews();
    }
  } else if((c.includes('light') || c.includes('lamp')) && (c.includes('on') || c.includes('off'))){
    const turnOn = c.includes('on') && !c.includes('off');
    const all = getDeviceList();
    const match = all.find(d => c.includes(d.name.toLowerCase().split(' ')[0]));
    const targets = match ? [match] : all;
    targets.forEach(d => toggleDevice(d.id, turnOn));
    reply = `${targets.map(d=>d.name).join(', ')} switched ${turnOn ? 'on' : 'off'}.`;
  } else if(c.includes('thermostat') || c.includes('temperature')){
    const match = c.match(/(\d{2,3})/);
    if(match){
      const val = Math.max(60, Math.min(82, parseInt(match[1])));
      setThermostat(val);
      reply = `Thermostat set to ${val} degrees.`;
    } else {
      reply = `Thermostat is currently at ${document.getElementById('thermSlider').value} degrees.`;
    }
  } else if((c.includes('time left') || c.includes('time remaining')) && (c.includes('timer') || c.includes('reminder') || timers.length)){
    if(!timers.length){
      reply = "You don't have any active timers.";
    } else {
      const soonest = [...timers].sort((a,b) => a.endTime - b.endTime)[0];
      reply = `${formatCountdown(soonest.endTime - Date.now())} left on your ${soonest.message ? 'reminder' : 'timer'}.`;
    }
  } else if(c.includes('cancel') && (c.includes('timer') || c.includes('reminder'))){
    cancelAllTimers();
    reply = 'All timers and reminders cancelled.';
  } else if(c.includes('remind me')){
    const hasAt = / at /i.test(cmd);
    let ms = null;
    let message = null;
    if(hasAt){
      ms = parseAbsoluteTimeMs(cmd);
      const m = cmd.match(/remind me at .+?\s+to\s+(.+)$/i);
      message = m ? m[1].trim() : null;
    } else {
      ms = parseDurationMs(c);
      const m = cmd.match(/remind me in .+?\s+to\s+(.+)$/i);
      message = m ? m[1].trim() : null;
    }
    if(ms && ms > 0){
      addTimer(ms, message || 'Reminder');
      reply = message ? `Okay, I'll remind you to ${message} in ${formatCountdown(ms)}.` : `Reminder set for ${formatCountdown(ms)} from now.`;
    } else {
      reply = "When should I remind you, and about what? Try 'remind me in 20 minutes to check the oven.'";
    }
  } else if(c.includes('timer')){
    const ms = parseDurationMs(c);
    if(ms > 0){
      addTimer(ms);
      reply = `Timer set for ${formatCountdown(ms)}.`;
    } else {
      reply = "How long should the timer be? Try 'set a timer for 10 minutes.'";
    }
  } else if(c.includes('time')){
    reply = `It's ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}.`;
  } else if(c.includes('forget our conversation') || c.includes('new conversation') || c.includes('clear your memory') || c.includes('start over')){
    clearConversationHistory();
    reply = 'Conversation memory cleared. Starting fresh.';
  } else if(c.includes('hello') || c.includes('hey moa') || c.includes('hi moa')){
    reply = 'At your service.';
  } else if(c.includes('most played') || c.includes('top tracks') || c.includes('top songs') || c.includes('songs i play a lot')){
    logLine('Pulling your top tracks from Spotify...', 'sys');
    spotifyPlayTopTracks().then(result => {
      const msg = result.success ? `Playing your top ${result.count} most-played tracks.` : result.message;
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(/^play\s+(?:my\s+)?playlist\s+.+$/i.test(cmd) || /^play\s+.+\s+playlist$/i.test(cmd)){
    const m = cmd.match(/^play\s+(?:my\s+)?playlist\s+(.+)$/i) || cmd.match(/^play\s+(.+?)\s+playlist$/i);
    const name = m[1].trim();
    logLine('Searching for playlist...', 'sys');
    spotifyPlayPlaylist(name).then(result => {
      const msg = result.success ? `Playing ${result.source} playlist "${result.playlistName}".` : result.message;
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(c.startsWith('play ') || c === 'play'){
    const query = cmd.replace(/^play\s*/i, '').trim();
    if(!query){
      reply = 'What would you like me to play?';
    } else {
      logLine('Searching Spotify...', 'sys');
      spotifyPlayQuery(query).then(result => {
        const msg = result.success ? `Playing ${result.track}.` : result.message;
        logLine(msg, 'sys');
        speak(msg);
        if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
      });
      return;
    }
  } else if(c.includes('pause')){
    spotifyPause().then(ok => {
      const msg = ok ? 'Paused.' : 'Could not pause — is Spotify open on a device?';
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(c.includes('resume') || c.includes('unpause')){
    spotifyResume().then(ok => {
      const msg = ok ? 'Resumed.' : 'Could not resume — is Spotify open on a device?';
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(c.includes('skip') || c.includes('next song')){
    spotifyNext().then(ok => {
      const msg = ok ? 'Skipped.' : 'Could not skip — is Spotify open on a device?';
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(c.includes('previous song') || c.includes('last song') || c.includes('go back a song')){
    spotifyPrevious().then(ok => {
      const msg = ok ? 'Went back a track.' : 'Could not go back — is Spotify open on a device?';
      logLine(msg, 'sys');
      speak(msg);
      if(typeof refreshNowPlaying === 'function') setTimeout(refreshNowPlaying, 500);
    });
    return;
  } else if(c.includes('volume') && (c.includes('music') || c.includes('spotify'))){
    const match = c.match(/(\d{1,3})/);
    if(match){
      const vol = parseInt(match[1]);
      spotifySetVolume(vol).then(ok => {
        const msg = ok ? `Music volume set to ${vol}%.` : 'Could not set volume — is Spotify open on a device?';
        logLine(msg, 'sys');
        speak(msg);
      });
      return;
    }
    reply = 'What volume would you like, 0 to 100?';
  } else {
    const useOllama = getOllamaEnabled();
    const apiKey = getApiKey();
    if(useOllama || apiKey){
      logLine('Thinking...', 'sys');
      const askFn = useOllama ? askOllama : askClaude;
      askFn(cmd).then(aiReply => {
        logLine(aiReply, 'sys');
        speak(aiReply);
      });
      return;
    }
    reply = "I don't have a command for that yet. Add an API key or enable local AI above to let me answer anything.";
  }

  logLine(reply, 'sys');
  speak(reply);
}

/* ---------- FULL BRIEFING (combines weather + news into one summary) ---------- */
function buildBriefing(){
  if(!liveWeather || !liveNews.length) return null;
  const d = liveWeather.daily[0];
  const now = new Date();
  const hr = now.getHours();
  const part = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';

  const wxLine = `Good ${part}. It's ${liveWeather.temp} degrees and ${liveWeather.cond.toLowerCase()} near ${liveWeather.locName}, with a high of ${d.h} and a low of ${d.l} today.`;
  const topHeadlines = liveNews.slice(0, 3).map(n => n.h);
  const newsLine = `Here are today's top stories: ${topHeadlines.join('. ')}.`;

  return `${wxLine} ${newsLine}`;
}

async function showBriefing(){
  const btn = document.getElementById('briefBtn');
  const box = document.getElementById('briefText');
  btn.disabled = true;

  if(!liveWeather) await fetchWeather();
  if(!liveNews.length) await fetchNews();

  const text = buildBriefing();
  btn.disabled = false;
  if(!text){
    box.textContent = "Couldn't put together a full briefing right now — try again in a moment.";
    box.classList.add('show');
    return;
  }
  box.textContent = text;
  box.classList.add('show');
  logLine('Full briefing requested.', 'user');
  logLine('Briefing delivered.', 'sys');
  speak(text);
}

/* ---------- VOICE RECOGNITION ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const orb = document.getElementById('orb');
const orbLabel = document.getElementById('orbLabel');
let recognizing = false;
let recognizer = null;

if(SpeechRec){
  recognizer = new SpeechRec();
  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.lang = 'en-US';

  recognizer.onstart = () => {
    recognizing = true;
    orb.classList.add('listening');
    orbLabel.textContent = 'Listening...';
  };
  recognizer.onend = () => {
    recognizing = false;
    orb.classList.remove('listening');
    orbLabel.textContent = 'Tap to speak';
    if(commandCaptureActive) resumeWakeIfNeeded();
  };
  recognizer.onerror = () => {
    recognizing = false;
    orb.classList.remove('listening');
    orbLabel.textContent = 'Tap to speak';
    if(commandCaptureActive) resumeWakeIfNeeded();
  };
  recognizer.onresult = (e) => {
    const text = e.results[0][0].transcript;
    handleCommand(text);
  };

  orb.addEventListener('click', () => {
    if(recognizing){ recognizer.stop(); return; }
    if(wakeShouldRun && wakeRecognizer){
      try{ wakeRecognizer.stop(); } catch(err){}
    }
    commandCaptureActive = true;
    try{ recognizer.start(); } catch(err){}
  });
} else {
  orbLabel.textContent = 'Voice unsupported — type below';
  orb.style.cursor = 'default';
  orb.addEventListener('click', () => {
    document.getElementById('cmdInput').focus();
  });
}

/* ---------- EVENT WIRING ---------- */
document.getElementById('thermSlider').addEventListener('input', e => {
  document.getElementById('thermVal').textContent = e.target.value + '°F';
});

document.getElementById('cmdSend').addEventListener('click', () => {
  const input = document.getElementById('cmdInput');
  handleCommand(input.value);
  input.value = '';
});
document.getElementById('cmdInput').addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    handleCommand(e.target.value);
    e.target.value = '';
  }
});

document.getElementById('wxRefresh').addEventListener('click', fetchWeather);
document.getElementById('newsRefresh').addEventListener('click', fetchNews);
document.getElementById('briefBtn').addEventListener('click', showBriefing);

document.getElementById('timersClearAll').addEventListener('click', cancelAllTimers);

/* ---------- INIT ---------- */
updateClock();
setInterval(updateClock, 15000);
renderDevices();
conversationHistory = loadConversationHistory();
if(conversationHistory.length){
  logLine(`Resumed previous conversation (${Math.floor(conversationHistory.length / 2)} exchanges). Say "new conversation" to start fresh.`, 'sys');
}
updateAiStatus();
checkOllama();
document.getElementById('wakeToggle').checked = getWakeEnabled();
if(getWakeEnabled()){
  setWakeStatus('Click the toggle to (re)activate listening.');
}
renderTimers();
tickTimers();
setInterval(tickTimers, 1000);
fetchWeather();
fetchNews();
logLine('MOA initialized. Loading live weather and news...', 'sys');
maybeRunAutoBriefing();
