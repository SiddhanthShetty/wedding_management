/**
 * Short personalised video invitations, made on the planner's device: the guest's 9:16 card is
 * animated on a canvas and recorded with MediaRecorder. Nothing is uploaded or rendered on a server.
 * No music is bundled; the planner may add an audio file they have the rights to.
 */

export const VIDEO_SECONDS = 8;
export const VIDEO_SIZE = { width: 720, height: 1280 };

/** Preferred container: MP4 (WhatsApp-friendly) when the browser can record it, else WebM. */
export function pickVideoFormat(isSupported: (mime: string) => boolean): { mime: string; extension: "mp4" | "webm" } | null {
  for (const mime of ["video/mp4;codecs=avc1,mp4a", "video/mp4;codecs=avc1", "video/mp4"]) if (isSupported(mime)) return { mime, extension: "mp4" };
  for (const mime of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) if (isSupported(mime)) return { mime, extension: "webm" };
  return null;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export type Petal = { x: number; y: number; r: number; rotation: number; alpha: number };
export type FrameState = { cardOpacity: number; cardScale: number; petals: Petal[]; outroOpacity: number };

/**
 * What to draw at time t (seconds): the card fades and settles in over 1.2 s, zooms slowly
 * (Ken Burns), petals drift down, and a closing line fades in during the last 2 s.
 * Deterministic, so the same guest always gets the same video.
 */
export function frameState(t: number, size = VIDEO_SIZE, petalCount = 26): FrameState {
  const intro = ease(t / 1.2);
  const petals: Petal[] = [];
  for (let i = 0; i < petalCount; i += 1) {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const rand = seed - Math.floor(seed);
    const speed = 90 + rand * 120;
    const startY = -60 - ((i * 97) % size.height);
    const y = startY + t * speed;
    const x = ((i * 157) % size.width) + Math.sin(t * 1.3 + i) * 24;
    petals.push({ x, y: ((y % (size.height + 120)) + size.height + 120) % (size.height + 120) - 60, r: 5 + rand * 6, rotation: t * (0.6 + rand) + i, alpha: 0.55 + rand * 0.35 });
  }
  return { cardOpacity: intro, cardScale: 1.06 - 0.06 * intro + 0.025 * Math.min(1, Math.max(0, (t - 1.2) / (VIDEO_SECONDS - 1.2))), petals, outroOpacity: ease((t - (VIDEO_SECONDS - 2)) / 0.8) };
}

/** Records the animated card. `cardImage` is the 9:16 card already drawn as a PNG. */
export async function recordInvitationVideo(input: {
  cardImage: Blob; background: string; petalColor: string; outroText: string; outroFont: string; audio?: File | null; onProgress?: (fraction: number) => void;
}): Promise<{ blob: Blob; extension: "mp4" | "webm" }> {
  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record video. Try Chrome, Edge or Safari, or share the card image instead.");
  const format = pickVideoFormat((mime) => MediaRecorder.isTypeSupported(mime));
  if (!format) throw new Error("This browser cannot record video. Share the card image instead.");
  const bitmap = await createImageBitmap(input.cardImage);
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_SIZE.width; canvas.height = VIDEO_SIZE.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create video frames.");
  const stream = canvas.captureStream(30);

  let audioContext: AudioContext | null = null;
  if (input.audio) {
    audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(await input.audio.arrayBuffer()).catch(() => { throw new Error("That music file could not be read. Try an MP3 or M4A file."); });
    const source = audioContext.createBufferSource(); source.buffer = buffer;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.9, audioContext.currentTime + 0.8);
    gain.gain.setValueAtTime(0.9, audioContext.currentTime + VIDEO_SECONDS - 1.2);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + VIDEO_SECONDS);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(gain).connect(destination);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    source.start();
  }

  const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 3_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const draw = (t: number) => {
    const state = frameState(t);
    context.fillStyle = input.background; context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.globalAlpha = state.cardOpacity;
    const w = canvas.width * state.cardScale; const h = canvas.height * state.cardScale;
    context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    context.restore();
    for (const petal of state.petals) {
      context.save(); context.translate(petal.x, petal.y); context.rotate(petal.rotation);
      context.globalAlpha = petal.alpha; context.fillStyle = input.petalColor;
      context.beginPath(); context.ellipse(0, 0, petal.r, petal.r * 1.6, 0, 0, Math.PI * 2); context.fill();
      context.restore();
    }
    if (state.outroOpacity > 0) {
      context.save(); context.globalAlpha = state.outroOpacity;
      context.fillStyle = "rgba(0,0,0,0.45)"; context.fillRect(0, canvas.height - 170, canvas.width, 170);
      context.fillStyle = "#ffffff"; context.font = input.outroFont; context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(input.outroText, canvas.width / 2, canvas.height - 85, canvas.width - 60);
      context.restore();
    }
  };

  recorder.start(250);
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      draw(Math.min(t, VIDEO_SECONDS));
      input.onProgress?.(Math.min(1, t / VIDEO_SECONDS));
      if (t >= VIDEO_SECONDS) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await finished;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  const blob = new Blob(chunks, { type: format.mime.split(";")[0] });
  if (blob.size > 15 * 1024 * 1024) throw new Error("The video came out larger than WhatsApp allows. Try again without music.");
  return { blob, extension: format.extension };
}
