/* ---------- PHILIPS HUE BRIDGE INTEGRATION ---------- */
const HUE_STORAGE_KEY = 'aegis_hue_config';

let hueBridgeIp = null;
let hueUsername = null;
let hueLights = {};
let hueConnected = false;

function loadHueConfig(){
  try{
    const raw = localStorage.getItem(HUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(err){
    return null;
  }
}

function saveHueConfig(ip, username){
  localStorage.setItem(HUE_STORAGE_KEY, JSON.stringify({ ip, username }));
}

function clearHueConfig(){
  localStorage.removeItem(HUE_STORAGE_KEY);
  hueBridgeIp = null;
  hueUsername = null;
  hueConnected = false;
  hueLights = {};
}

async function discoverHueBridge(){
  const res = await fetch('https://discovery.meethue.com/');
  const data = await res.json();
  if(!data || !data.length){
    throw new Error('No bridge found on your network. Try entering its IP manually below.');
  }
  return data[0].internalipaddress;
}

async function pairHueBridge(ip){
  const res = await fetch(`http://${ip}/api`, {
    method: 'POST',
    body: JSON.stringify({ devicetype: 'moa#browser' })
  });
  const data = await res.json();
  if(!data[0] || data[0].error){
    const msg = data[0] && data[0].error ? data[0].error.description : 'Pairing failed.';
    throw new Error(msg);
  }
  return data[0].success.username;
}

async function fetchHueLights(){
  const res = await fetch(`http://${hueBridgeIp}/api/${hueUsername}/lights`);
  const data = await res.json();
  if(data[0] && data[0].error){
    throw new Error(data[0].error.description);
  }
  hueLights = {};
  Object.entries(data).forEach(([id, l]) => {
    hueLights[id] = { id, name: l.name, on: l.state.on };
  });
  return hueLights;
}

async function setHueLightState(id, on){
  await fetch(`http://${hueBridgeIp}/api/${hueUsername}/lights/${id}/state`, {
    method: 'PUT',
    body: JSON.stringify({ on })
  });
  if(hueLights[id]) hueLights[id].on = on;
}

function markConnected(){
  hueConnected = true;
  const count = Object.keys(hueLights).length;
  document.getElementById('hueStatus').textContent = `Connected · ${count} light${count === 1 ? '' : 's'} found`;
  document.getElementById('hueConnect').style.display = 'none';
  document.getElementById('hueManual').style.display = 'none';
  document.getElementById('homeNote').textContent = 'Connected to your real Hue bridge. Voice and text commands now control your actual lights.';
  const badge = document.getElementById('hueBadge');
  badge.textContent = 'Live';
  badge.classList.add('connected');
  renderDevices();
}

async function completeLinking(ip, statusEl, btn){
  btn.disabled = true;
  statusEl.textContent = 'Linking...';
  try{
    const username = await pairHueBridge(ip);
    hueBridgeIp = ip;
    hueUsername = username;
    saveHueConfig(ip, username);
    await fetchHueLights();
    markConnected();
  } catch(err){
    statusEl.textContent = err.message.includes('link button')
      ? 'Press the button on your bridge, then click Link again.'
      : (err.message || 'Linking failed. Press the bridge button and try again.');
    btn.disabled = false;
  }
}

async function initHue(){
  const saved = loadHueConfig();
  if(!saved){ return; }
  hueBridgeIp = saved.ip;
  hueUsername = saved.username;
  try{
    await fetchHueLights();
    markConnected();
  } catch(err){
    document.getElementById('hueStatus').textContent = 'Saved bridge unreachable — reconnect below.';
  }
}

document.getElementById('hueDiscoverBtn').addEventListener('click', async () => {
  const btn = document.getElementById('hueDiscoverBtn');
  const status = document.getElementById('hueStatus');
  btn.disabled = true;
  status.textContent = 'Searching for your bridge...';
  try{
    const ip = await discoverHueBridge();
    status.textContent = `Bridge found at ${ip}. Press the button on your bridge now, then click Link.`;
    btn.textContent = 'Link bridge';
    btn.disabled = false;
    btn.onclick = () => completeLinking(ip, status, btn);
  } catch(err){
    status.textContent = err.message || 'Could not find a bridge.';
    btn.disabled = false;
  }
});

document.getElementById('hueManualBtn').addEventListener('click', () => {
  const ip = document.getElementById('hueManualIp').value.trim();
  const status = document.getElementById('hueStatus');
  const btn = document.getElementById('hueManualBtn');
  if(!ip){
    status.textContent = 'Enter your bridge IP first.';
    return;
  }
  status.textContent = 'Press the button on your bridge now, then click Link again if needed.';
  completeLinking(ip, status, btn);
});

initHue();