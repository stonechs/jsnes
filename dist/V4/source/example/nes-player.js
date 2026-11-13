// JSNES Browser adapter for the V013 mobile/touch interface.
const player = document.getElementById("player");
const screen = document.getElementById("screen");
const fileInput = document.getElementById("rom");
const muteButton = document.getElementById("mute");
const fullButton = document.getElementById("full");
const statusLine = document.getElementById("status");

let ready = false;
let muted = false;
let loadSequence = 0;
const heldButtons = Array.from({ length: 8 }, () => new Set());

const browser = new jsnes.Browser({
  container: screen,
  onError(error) {
    ready = false;
    statusLine.textContent = `运行失败：${error.message}`;
  },
});
const nes = browser.nes;

// Keep the lite player's Space=Select mapping and avoid double key events from
// Browser's default keyboard handler; this handler tracks keyboard and touch
// sources together so one release cannot cancel another held input.
document.removeEventListener("keydown", browser.keyboard.handleKeyDown);
document.removeEventListener("keyup", browser.keyboard.handleKeyUp);
document.removeEventListener("keypress", browser.keyboard.handleKeyPress);

const writeAudioSample = nes.opts.onAudioSample;
nes.opts.onAudioSample = (left, right) => {
  if (!muted && writeAudioSample) writeAudioSample(left, right);
};

function pressButton(button, source) {
  const sources = heldButtons[button];
  if (!sources.size) nes.buttonDown(1, button);
  sources.add(source);
}

function releaseButton(button, source) {
  const sources = heldButtons[button];
  if (sources.delete(source) && !sources.size) nes.buttonUp(1, button);
}

function clearInputs() {
  heldButtons.forEach((sources, button) => {
    if (sources.size) nes.buttonUp(1, button);
    sources.clear();
  });
  document
    .querySelectorAll('.touch[aria-pressed="true"]')
    .forEach((button) => button.setAttribute("aria-pressed", "false"));
}

function resumeAudio() {
  const context = browser._speakers.audioCtx;
  if (context?.state === "suspended") context.resume().catch(() => {});
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await player.requestFullscreen();
  } catch {
    statusLine.textContent = "浏览器未允许全屏";
  }
}

fullButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  fullButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

muteButton.addEventListener("click", () => {
  muted = !muted;
  muteButton.textContent = muted ? "已静音" : "静音";
  muteButton.setAttribute("aria-pressed", String(muted));
  resumeAudio();
});

const keyButtons = {
  "KeyX": 0,
  "KeyZ": 1,
  "Space": 2,
  "Enter": 3,
  "ArrowUp": 4,
  "ArrowDown": 5,
  "ArrowLeft": 6,
  "ArrowRight": 7,
};

for (const type of ["keydown", "keyup"]) {
  window.addEventListener(type, (event) => {
    const down = event.type === "keydown";
    if (down && (event.ctrlKey || event.metaKey || event.altKey || event.isComposing)) return;
    if (event.code === "KeyF") {
      event.preventDefault();
      if (down && !event.repeat) toggleFullscreen();
      return;
    }
    const button = keyButtons[event.code];
    if (!ready || button === undefined) return;
    event.preventDefault();
    const source = `keyboard:${event.code}`;
    if (down) {
      resumeAudio();
      pressButton(button, source);
    } else {
      releaseButton(button, source);
    }
  });
}

document.querySelectorAll(".touch").forEach((button) => {
  const buttonIndex = Number(button.dataset.button);
  let source = "";

  function release(event) {
    if (!source || (event && event.pointerId !== Number(source.slice(6)))) return;
    releaseButton(buttonIndex, source);
    source = "";
    button.setAttribute("aria-pressed", "false");
  }

  button.addEventListener("pointerdown", (event) => {
    if (source || event.button !== 0) return;
    event.preventDefault();
    source = `touch:${event.pointerId}`;
    button.setPointerCapture(event.pointerId);
    if (ready) {
      resumeAudio();
      pressButton(buttonIndex, source);
    }
    button.setAttribute("aria-pressed", "true");
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, release);
  }
});

window.addEventListener("blur", clearInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInputs();
});
document.addEventListener("pointerdown", resumeAudio);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const sequence = ++loadSequence;
  browser.stop();
  clearInputs();
  ready = false;
  statusLine.textContent = "正在读取…";

  try {
    const data = await readGameFile(file);
    if (sequence !== loadSequence) return;
    browser.loadROM(new Uint8Array(data));
    ready = true;
    statusLine.textContent = file.name;
    resumeAudio();
  } catch (error) {
    if (sequence === loadSequence) {
      statusLine.textContent = `加载失败：${error.message}`;
    }
  }
  fileInput.value = "";
});
