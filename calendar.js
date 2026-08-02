/* ---------- STORAGE ---------- */
const CAL_STORAGE_KEY = 'aegis_calendar_events';

function loadEvents(){
  try{
    const raw = localStorage.getItem(CAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(err){
    return [];
  }
}
function saveEvents(events){
  localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(events));
}

let events = loadEvents();
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateKey(y, m, d){
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/* ---------- CLOCK ---------- */
function updateClock(){
  const now = new Date();
  document.getElementById('clockTime').textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  document.getElementById('clockDate').textContent = now.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
}
updateClock();
setInterval(updateClock, 15000);

/* ---------- CALENDAR GRID ---------- */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function renderCalendar(){
  document.getElementById('monthLabel').textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = todayStr();

  for(let i = 0; i < firstDay; i++){
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  for(let day = 1; day <= daysInMonth; day++){
    const key = dateKey(viewYear, viewMonth, day);
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (key === today ? ' today' : '');

    const num = document.createElement('div');
    num.className = 'cal-daynum';
    num.textContent = day;
    cell.appendChild(num);

    const dayEvents = events.filter(e => e.date === key).sort((a,b) => (a.time||'').localeCompare(b.time||''));
    const maxShow = 3;
    dayEvents.slice(0, maxShow).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'event-chip';
      chip.textContent = ev.time ? `${ev.time} ${ev.title}` : ev.title;
      chip.addEventListener('click', (e) => { e.stopPropagation(); openEditForm(ev.id); });
      cell.appendChild(chip);
    });
    if(dayEvents.length > maxShow){
      const more = document.createElement('div');
      more.className = 'event-more';
      more.textContent = `+${dayEvents.length - maxShow} more`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openNewForm(key));
    grid.appendChild(cell);
  }
}

document.getElementById('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if(viewMonth < 0){ viewMonth = 11; viewYear--; }
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if(viewMonth > 11){ viewMonth = 0; viewYear++; }
  renderCalendar();
});

/* ---------- EVENT FORM ---------- */
const form = document.getElementById('eventForm');
const formTitle = document.getElementById('formTitle');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const cancelBtn = document.getElementById('cancelBtn');

function openNewForm(dateKeyStr){
  form.reset();
  document.getElementById('eventId').value = '';
  document.getElementById('eventDate').value = dateKeyStr || todayStr();
  formTitle.textContent = 'New event';
  saveBtn.textContent = 'Add event';
  deleteBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
  document.getElementById('eventTitle').focus();
}

function openEditForm(id){
  const ev = events.find(e => e.id === id);
  if(!ev) return;
  document.getElementById('eventId').value = ev.id;
  document.getElementById('eventDate').value = ev.date;
  document.getElementById('eventTime').value = ev.time || '';
  document.getElementById('eventTitle').value = ev.title;
  document.getElementById('eventNotes').value = ev.notes || '';
  formTitle.textContent = 'Edit event';
  saveBtn.textContent = 'Save changes';
  deleteBtn.style.display = 'inline-block';
  cancelBtn.style.display = 'inline-block';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('eventId').value;
  const eventData = {
    id: id || 'ev_' + Date.now(),
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    title: document.getElementById('eventTitle').value.trim(),
    notes: document.getElementById('eventNotes').value.trim()
  };
  if(!eventData.title) return;

  if(id){
    events = events.map(ev => ev.id === id ? eventData : ev);
  } else {
    events.push(eventData);
  }
  saveEvents(events);
  renderCalendar();
  renderUpcoming();
  openNewForm(eventData.date);
});

deleteBtn.addEventListener('click', () => {
  const id = document.getElementById('eventId').value;
  if(!id) return;
  events = events.filter(ev => ev.id !== id);
  saveEvents(events);
  renderCalendar();
  renderUpcoming();
  openNewForm(todayStr());
});

cancelBtn.addEventListener('click', () => {
  openNewForm(todayStr());
});

/* ---------- UPCOMING LIST ---------- */
function renderUpcoming(){
  const list = document.getElementById('upcomingList');
  const today = todayStr();
  const upcoming = events
    .filter(e => e.date >= today)
    .sort((a,b) => (a.date + (a.time||'00:00')).localeCompare(b.date + (b.time||'00:00')))
    .slice(0, 8);

  if(!upcoming.length){
    list.innerHTML = '<div class="upcoming-empty">No upcoming events. Click a day on the calendar to add one.</div>';
    return;
  }

  list.innerHTML = upcoming.map(ev => {
    const d = new Date(ev.date + 'T00:00:00');
    const label = d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
    return `
      <div class="upcoming-item" data-id="${ev.id}">
        <div class="upcoming-date">${label}${ev.time ? ' · ' + ev.time : ''}</div>
        <div class="upcoming-title">${ev.title}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.upcoming-item').forEach(el => {
    el.addEventListener('click', () => openEditForm(el.dataset.id));
  });
}

/* ---------- VOICE COMMAND PARSING ---------- */
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_NAMES_LC = MONTH_NAMES.map(m => m.toLowerCase());

function toKeyFromDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDateFromText(text){
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0,0,0,0);

  if(/\btomorrow\b/.test(lower)){
    const d = new Date(today); d.setDate(d.getDate()+1);
    return { date: toKeyFromDate(d), matched: 'tomorrow' };
  }
  if(/\btoday\b/.test(lower)){
    return { date: toKeyFromDate(today), matched: 'today' };
  }

  const wdMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if(wdMatch){
    const targetIdx = WEEKDAYS.indexOf(wdMatch[2]);
    const d = new Date(today);
    let diff = (targetIdx - d.getDay() + 7) % 7;
    if(diff === 0) diff = wdMatch[1] ? 7 : 0;
    else if(wdMatch[1]) diff += 7;
    d.setDate(d.getDate() + diff);
    return { date: toKeyFromDate(d), matched: wdMatch[0] };
  }

  const mdMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(st|nd|rd|th)?\b/);
  if(mdMatch){
    const monthIdx = MONTH_NAMES_LC.findIndex(m => m.startsWith(mdMatch[1].slice(0,3)));
    if(monthIdx !== -1){
      let d = new Date(today.getFullYear(), monthIdx, parseInt(mdMatch[2]));
      if(d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toKeyFromDate(d), matched: mdMatch[0] };
    }
  }

  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if(slashMatch){
    let d = new Date(today.getFullYear(), parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
    if(d < today) d.setFullYear(d.getFullYear() + 1);
    return { date: toKeyFromDate(d), matched: slashMatch[0] };
  }

  return { date: toKeyFromDate(today), matched: null };
}

function parseTimeFromText(text){
  const lower = text.toLowerCase();
  if(/\bnoon\b/.test(lower)) return { time: '12:00', matched: 'noon' };
  if(/\bmidnight\b/.test(lower)) return { time: '00:00', matched: 'midnight' };

  const m = lower.match(/\b(at\s+)?(\d{1,2})(:(\d{2}))?\s*(am|pm)?\b/);
  if(m && (m[5] || m[3])){
    let hour = parseInt(m[2]);
    const min = m[4] ? parseInt(m[4]) : 0;
    const ampm = m[5];
    if(ampm === 'pm' && hour < 12) hour += 12;
    if(ampm === 'am' && hour === 12) hour = 0;
    if(!ampm && hour >= 1 && hour <= 7) hour += 12;
    return { time: `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`, matched: m[0] };
  }
  return { time: '', matched: null };
}

function escapeRegex(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitle(text, dateMatched, timeMatched){
  let t = text;
  t = t.replace(/^(add|schedule|create event|new event|book|set up)\s+/i, '');
  t = t.replace(/^remind me to\s+/i, '');
  if(dateMatched) t = t.replace(new RegExp(escapeRegex(dateMatched), 'i'), '');
  if(timeMatched) t = t.replace(new RegExp(escapeRegex(timeMatched), 'i'), '');
  t = t.replace(/\b(on|for|at)\b/gi, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[,\s]+|[,\s]+$/g, '');
  if(!t) t = 'New event';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatTime12(t){
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if(hour12 === 0) hour12 = 12;
  return `${hour12}:${String(m).padStart(2,'0')} ${period}`;
}

/* ---------- VOICE: ADD EVENT ---------- */
function addEventFromSpeech(rawText){
  const dateInfo = parseDateFromText(rawText);
  const timeInfo = parseTimeFromText(rawText);
  const title = extractTitle(rawText, dateInfo.matched, timeInfo.matched);

  const eventData = {
    id: 'ev_' + Date.now(),
    date: dateInfo.date,
    time: timeInfo.time,
    title,
    notes: ''
  };
  events.push(eventData);
  saveEvents(events);
  renderCalendar();
  renderUpcoming();

  const d = new Date(eventData.date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
  const timeLabel = eventData.time ? ` at ${formatTime12(eventData.time)}` : '';
  const confirmation = `Added "${title}" on ${dateLabel}${timeLabel}.`;
  calFeedback(confirmation);
  calSpeak(confirmation);
  openEditForm(eventData.id);
}

/* ---------- VOICE: READ SCHEDULE ---------- */
function readScheduleFromSpeech(rawText){
  const lower = rawText.toLowerCase();
  const today = todayStr();
  let list, label;

  if(/\btomorrow\b/.test(lower)){
    const d = new Date(); d.setDate(d.getDate()+1);
    const key = toKeyFromDate(d);
    list = events.filter(e => e.date === key).sort((a,b) => (a.time||'').localeCompare(b.time||''));
    label = 'tomorrow';
  } else if(/\btoday\b/.test(lower)){
    list = events.filter(e => e.date === today).sort((a,b) => (a.time||'').localeCompare(b.time||''));
    label = 'today';
  } else if(/\bthis week\b/.test(lower)){
    const now = new Date(); now.setHours(0,0,0,0);
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate()+7);
    list = events.filter(e => e.date >= toKeyFromDate(now) && e.date < toKeyFromDate(weekEnd))
      .sort((a,b) => (a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
    label = 'this week';
  } else {
    list = events.filter(e => e.date >= today)
      .sort((a,b) => (a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))
      .slice(0, 5);
    label = 'upcoming';
  }

  let response;
  if(!list.length){
    response = label === 'upcoming' ? 'You have no upcoming events.' : `You have no events ${label}.`;
  } else {
    const items = list.map(e => {
      const d = new Date(e.date + 'T00:00:00');
      const dl = d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
      const timePart = e.time ? ` at ${formatTime12(e.time)}` : '';
      const datePart = label === 'upcoming' ? ` on ${dl}` : '';
      return `${e.title}${timePart}${datePart}`;
    });
    const intro = label === 'upcoming' ? "Here's what's coming up" : `Here's what you have ${label}`;
    response = `${intro}: ${items.join('. ')}.`;
  }
  calFeedback(response);
  calSpeak(response);
}

/* ---------- VOICE: FEEDBACK + SPEECH SYNTHESIS ---------- */
function calFeedback(text){
  const box = document.getElementById('calVoiceFeedback');
  box.textContent = text;
  box.classList.add('show');
}

function calSpeak(text){
  if('speechSynthesis' in window){
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }
}

/* ---------- VOICE: COMMAND ROUTER ---------- */
function handleCalCommand(raw){
  const text = raw.trim();
  if(!text) return;
  const lower = text.toLowerCase();

  const isAdd = /^(add|schedule|create event|new event|book|set up|remind me to)\b/.test(lower);
  const isRead = /(what'?s on|what do i have|read my|my schedule|my calendar|what'?s happening|any events|upcoming)/.test(lower);

  if(isAdd){
    addEventFromSpeech(text);
  } else if(isRead){
    readScheduleFromSpeech(text);
  } else {
    const msg = 'I didn\'t catch that as an add or a read command. Try "add dentist tomorrow at 3pm" or "what\'s on my calendar today".';
    calFeedback(msg);
    calSpeak(msg);
  }
}

/* ---------- VOICE: RECOGNITION WIRING ---------- */
const calMicBtn = document.getElementById('calMicBtn');
const calMicLabel = calMicBtn.querySelector('.cal-mic-label');
const CalSpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let calRecognizing = false;
let calRecognizer = null;

if(CalSpeechRec){
  calRecognizer = new CalSpeechRec();
  calRecognizer.continuous = false;
  calRecognizer.interimResults = false;
  calRecognizer.lang = 'en-US';

  calRecognizer.onstart = () => {
    calRecognizing = true;
    calMicBtn.classList.add('listening');
    calMicLabel.textContent = 'Listening...';
  };
  calRecognizer.onend = () => {
    calRecognizing = false;
    calMicBtn.classList.remove('listening');
    calMicLabel.textContent = 'Tap to speak';
  };
  calRecognizer.onerror = () => {
    calRecognizing = false;
    calMicBtn.classList.remove('listening');
    calMicLabel.textContent = 'Tap to speak';
  };
  calRecognizer.onresult = (e) => {
    handleCalCommand(e.results[0][0].transcript);
  };

  calMicBtn.addEventListener('click', () => {
    if(calRecognizing){ calRecognizer.stop(); return; }
    try{ calRecognizer.start(); } catch(err){}
  });
} else {
  calMicLabel.textContent = 'Voice unsupported — type below';
  calMicBtn.disabled = true;
}

document.getElementById('calCmdSend').addEventListener('click', () => {
  const input = document.getElementById('calCmdInput');
  handleCalCommand(input.value);
  input.value = '';
});
document.getElementById('calCmdInput').addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    handleCalCommand(e.target.value);
    e.target.value = '';
  }
});

/* ---------- INIT ---------- */
renderCalendar();
renderUpcoming();
openNewForm(todayStr());