'use strict';

const $ = id => document.getElementById(id);
const BAUD = 115200;
let model = null, classes = [], webcam = null, mode = 'upload';
let cameraRunning = false, cameraToken = 0, modelToken = 0, imageToken = 0;
let port = null, writer = null, reader = null, readTask = null;
let connecting = false, disconnecting = false;
let uploadedUrl = null, lastResult = null, lastCameraCode = null;
let stableCode = null, stableCount = 0, lastSendAt = 0;
let pendingWrite = Promise.resolve(), busyPredict = false;

function info(id, message) { $(id).textContent = message; }
function log(message) {
  const line = `[${new Date().toLocaleTimeString('ko-KR')}] ${message}`;
  $('log').textContent = line + '\n' + $('log').textContent.slice(0, 4500);
}
function normalizeURL(url) {
  url = url.trim();
  if (!/^https:\/\/teachablemachine\.withgoogle\.com\/models\/[^/\s?#]+\/?$/i.test(url)) {
    throw Error('Teachable Machine 공유 모델 URL을 확인하세요.');
  }
  return url.endsWith('/') ? url : url + '/';
}
function resetStability() { stableCode = null; stableCount = 0; lastCameraCode = null; }
function resetResults() {
  lastResult = null;
  resetStability();
  $('sendLast').disabled = true;
  info('topResult', '아직 인식 결과가 없습니다.');
  $('probabilities').replaceChildren();
}
function stopCamera() {
  cameraRunning = false;
  cameraToken++;
  resetStability();
  if (webcam) {
    try { webcam.stop(); } catch (e) { log('카메라 종료: ' + e.message); }
    webcam = null;
  }
  $('cameraPreview').replaceChildren();
  const s = document.createElement('span');
  s.id = 'cameraPlaceholder'; s.className = 'muted'; s.textContent = '카메라가 중지되었습니다.';
  $('cameraPreview').append(s);
  $('startCamera').disabled = false;
}
function setMode(next) {
  if (mode !== next) { stopCamera(); resetResults(); }
  mode = next;
  $('uploadArea').classList.toggle('hidden', next !== 'upload');
  $('cameraArea').classList.toggle('hidden', next !== 'camera');
  $('uploadTab').classList.toggle('selected', next === 'upload');
  $('cameraTab').classList.toggle('selected', next === 'camera');
  $('uploadTab').setAttribute('aria-pressed', String(next === 'upload'));
  $('cameraTab').setAttribute('aria-pressed', String(next === 'camera'));
}
$('uploadTab').onclick = () => setMode('upload');
$('cameraTab').onclick = () => setMode('camera');
$('stopCamera').onclick = stopCamera;
$('threshold').oninput = () => {
  info('thresholdLabel', $('threshold').value + '%');
  resetResults();
};
$('autoSend').onchange = resetStability;

$('loadModel').onclick = async () => {
  stopCamera(); resetResults(); model = null; classes = [];
  const token = ++modelToken;
  $('loadModel').disabled = true;
  info('modelStatus', '모델 로드 중...');
  $('classMappings').textContent = '모델 로드 중...';
  $('testButtons').replaceChildren();
  try {
    const url = normalizeURL($('modelUrl').value);
    if (!window.tmImage) throw Error('TM 라이브러리가 로드되지 않았습니다. 인터넷 연결을 확인하세요.');
    const loaded = await tmImage.load(url + 'model.json', url + 'metadata.json');
    if (token !== modelToken) return;
    const labels = loaded.getClassLabels();
    if (!labels.length || labels.some(name => !name || /[\r\n]/.test(name))) {
      throw Error('클래스 이름에 줄바꿈이 있거나 비어 있습니다.');
    }
    model = loaded; classes = labels;
    $('classMappings').textContent = '학습된 클래스: ' + classes.join(' / ');
    const root = $('testButtons');
    classes.forEach(name => {
      const b = document.createElement('button');
      b.className = 'secondary'; b.textContent = name + ' 시험';
      b.onclick = () => sendCommand(name); root.append(b);
    });
    const reset = document.createElement('button');
    reset.className = 'secondary'; reset.textContent = '초기화';
    reset.onclick = () => sendCommand('RESET'); root.append(reset);
    info('modelStatus', `모델 로드 완료 · ${classes.length}개 클래스`);
    log('AI 모델 로드 완료 · ' + classes.join(', '));
  } catch (e) {
    model = null; classes = [];
    $('classMappings').textContent = '모델을 먼저 불러오세요.';
    info('modelStatus', '모델 오류: ' + e.message); log('모델 오류: ' + e.message);
  } finally { $('loadModel').disabled = false; }
};

$('fileInput').onchange = () => {
  imageToken++;
  const file = $('fileInput').files?.[0];
  if (uploadedUrl) { URL.revokeObjectURL(uploadedUrl); uploadedUrl = null; }
  resetResults();
  const image = $('uploadedImage');
  image.classList.add('hidden'); image.removeAttribute('src');
  $('uploadPlaceholder').classList.remove('hidden');
  info('uploadPlaceholder', '파일을 선택하면 미리보기가 표시됩니다.');
  if (!file) return;
  if (!file.type.startsWith('image/')) { log('이미지 파일만 선택할 수 있습니다.'); return; }
  const token = imageToken;
  image.onload = () => {
    if (token !== imageToken) return;
    image.classList.remove('hidden'); $('uploadPlaceholder').classList.add('hidden');
  };
  image.onerror = () => { info('uploadPlaceholder', '이미지를 열 수 없습니다. 다른 사진을 선택하세요.'); log('이미지를 열 수 없습니다.'); };
  uploadedUrl = URL.createObjectURL(file); image.src = uploadedUrl;
};
$('analyzeImage').onclick = async () => {
  if (!model) { log('먼저 AI 모델을 불러오세요.'); return; }
  if (!$('uploadedImage').complete || !$('uploadedImage').naturalWidth || !uploadedUrl) {
    log('먼저 이미지 파일을 선택하세요.'); return;
  }
  if (busyPredict) return;
  busyPredict = true; $('analyzeImage').disabled = true;
  try { await runPrediction($('uploadedImage'), 'upload'); }
  catch (e) { log('이미지 분석 오류: ' + e.message); }
  finally { busyPredict = false; $('analyzeImage').disabled = false; }
};
$('startCamera').onclick = async () => {
  if (!model) { log('먼저 AI 모델을 불러오세요.'); return; }
  if (cameraRunning || $('startCamera').disabled) return;
  const token = ++cameraToken;
  let cam = null;
  $('startCamera').disabled = true;
  try {
    cam = new tmImage.Webcam(400, 300, false);
    await cam.setup({ facingMode: 'environment' });
    if (token !== cameraToken) { cam.stop(); return; }
    await cam.play();
    if (token !== cameraToken) { cam.stop(); return; }
    webcam = cam; cameraRunning = true;
    $('cameraPreview').replaceChildren(cam.canvas);
    log('카메라 시작'); cameraLoop(token);
  } catch (e) {
    if (cam) { try { cam.stop(); } catch {} }
    if (token === cameraToken) { log('카메라 오류: ' + e.message); stopCamera(); }
  } finally { if (token === cameraToken) $('startCamera').disabled = false; }
};
async function cameraLoop(token) {
  if (!cameraRunning || token !== cameraToken) return;
  try { webcam.update(); await runPrediction(webcam.canvas, 'camera'); }
  catch (e) { if (token === cameraToken) { log('카메라 분석 오류: ' + e.message); stopCamera(); } return; }
  if (cameraRunning && token === cameraToken) requestAnimationFrame(() => cameraLoop(token));
}
async function runPrediction(element, source) {
  const currentModel = model, token = modelToken, camera = cameraToken, image = imageToken;
  const predictions = await currentModel.predict(element);
  if (currentModel !== model || token !== modelToken || mode !== source) return;
  if (source === 'camera' && (!cameraRunning || camera !== cameraToken)) return;
  if (source === 'upload' && image !== imageToken) return;
  if (!predictions.length) throw Error('분류 결과가 없습니다.');
  const top = [...predictions].sort((a, b) => b.probability - a.probability)[0];
  const passed = top.probability * 100 >= Number($('threshold').value);
  const code = passed ? top.className : null;
  lastResult = passed ? { code, top } : null;
  $('sendLast').disabled = !passed;
  info('topResult', `${top.className} · ${(top.probability * 100).toFixed(1)}%\n${passed ? '전송할 클래스: ' + code : '인식 기준 미달 → 전송하지 않음'}`);
  const root = $('probabilities'); root.replaceChildren();
  predictions.forEach(p => {
    const row = document.createElement('div'); row.className = 'probrow';
    const head = document.createElement('div'); head.className = 'probhead';
    const name = document.createElement('span'); name.textContent = p.className;
    const value = document.createElement('span'); value.textContent = (p.probability * 100).toFixed(1) + '%';
    head.append(name, value);
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('div'); fill.className = 'fill';
    fill.style.width = (p.probability * 100) + '%'; bar.append(fill); row.append(head, bar); root.append(row);
  });
  if (!$('autoSend').checked || !port || !passed) {
    if (source === 'camera' && !passed) resetStability();
    return;
  }
  if (source === 'upload') await sendCommand(code);
  else {
    if (code !== stableCode) { stableCode = code; stableCount = 1; } else stableCount++;
    if (stableCount >= 3 && code !== lastCameraCode && Date.now() - lastSendAt >= 1200) {
      const ok = await sendCommand(code); if (ok) lastCameraCode = code;
    }
  }
}

async function connect() {
  if (!('serial' in navigator)) { log('이 브라우저는 Web Serial을 지원하지 않습니다. 데스크톱 Chrome/Edge 및 HTTPS/localhost를 사용하세요.'); return; }
  if (port || connecting || disconnecting) { log('이미 연결되어 있거나 연결 처리 중입니다.'); return; }
  let candidate = null;
  connecting = true; $('connect').disabled = true;
  try {
    candidate = await navigator.serial.requestPort();
    await candidate.open({ baudRate: BAUD });
    port = candidate; writer = port.writable.getWriter();
    resetStability(); lastSendAt = 0;
    info('serialStatus', '연결됨 · ' + BAUD + 'bps'); log('USB 시리얼 연결됨');
    readTask = readSerial(port);
  } catch (e) {
    log('시리얼 연결 실패: ' + e.message);
    if (candidate) { try { await candidate.close(); } catch {} }
    port = null; writer = null; info('serialStatus', '연결되지 않음 · 115200bps');
  } finally { connecting = false; $('connect').disabled = false; }
}
$('connect').onclick = connect;
async function readSerial(p) {
  if (!p.readable) return;
  const textDecoder = new TextDecoder();
  let buffer = '';
  const currentReader = p.readable.getReader(); reader = currentReader;
  try {
    while (port === p && !disconnecting) {
      const { value, done } = await currentReader.read();
      if (done) break;
      buffer += textDecoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
        if (line) log('micro:bit → ' + line);
      }
      if (buffer.length > 512) buffer = buffer.slice(-256);
    }
  } catch (e) { if (port === p && !disconnecting) log('수신 종료: ' + e.message); }
  finally { try { currentReader.releaseLock(); } catch {} if (reader === currentReader) reader = null; }
}
async function sendCommand(code) {
  if (!port || !writer || disconnecting) { log('시리얼을 먼저 연결하세요.'); return false; }
  if (code !== 'RESET' && !classes.includes(code)) { log('현재 모델에 없는 클래스 이름입니다: ' + code); return false; }
  if (/[\r\n]/.test(code)) { log('클래스 이름에 줄바꿈을 사용할 수 없습니다.'); return false; }
  const currentWriter = writer, token = modelToken;
  const work = async () => {
    if (!port || writer !== currentWriter || token !== modelToken) return false;
    try {
      await currentWriter.write(new TextEncoder().encode(code + '\n'));
      lastSendAt = Date.now(); log('PC → micro:bit : ' + code); return true;
    } catch (e) { log('전송 실패: ' + e.message); return false; }
  };
  pendingWrite = pendingWrite.then(work, work); return pendingWrite;
}
$('sendLast').onclick = () => lastResult && sendCommand(lastResult.code);
async function disconnect() {
  if (!port || disconnecting) return;
  const p = port; disconnecting = true;
  $('disconnect').disabled = true; $('connect').disabled = true;
  try {
    await pendingWrite;
    if (reader) { try { await reader.cancel(); } catch {} }
    if (readTask) await readTask;
    if (writer) { try { writer.releaseLock(); } catch {} writer = null; }
    await p.close(); log('시리얼 연결 해제');
  } catch (e) { log('연결 해제 오류: ' + e.message); }
  finally {
    if (port === p) port = null;
    writer = null; readTask = null; disconnecting = false; resetStability();
    $('disconnect').disabled = false; $('connect').disabled = false;
    info('serialStatus', '연결되지 않음 · 115200bps');
  }
}
$('disconnect').onclick = disconnect;
if (navigator.serial) navigator.serial.addEventListener('disconnect', event => {
  if (event.target === port) { log('USB 장치가 분리되었습니다.'); disconnect(); }
});
window.addEventListener('beforeunload', () => { stopCamera(); if (uploadedUrl) URL.revokeObjectURL(uploadedUrl); });
