export function drawAnalogClock(ctx, size, hour, minute) {
  const compact = size <= 16;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 0.5;
  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = compact ? 1 : 2;
  ctx.strokeStyle = "#111";
  ctx.stroke();

  const tickCount = compact ? 4 : 12;
  const inner = r * (compact ? 0.78 : 0.82);
  const outer = r * (compact ? 0.94 : 0.93);
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = compact ? 1.25 : 1;
    ctx.stroke();
  }

  const minuteAngle = (minute / 60) * Math.PI * 2 - Math.PI / 2;
  const hourAngle =
    ((hour % 12) / 12) * Math.PI * 2 + (minute / 60) * (Math.PI / 6) - Math.PI / 2;

  ctx.strokeStyle = "#111";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hourAngle) * r * 0.52, cy + Math.sin(hourAngle) * r * 0.52);
  ctx.lineWidth = compact ? 2.2 : size * 0.12;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(minuteAngle) * r * 0.78, cy + Math.sin(minuteAngle) * r * 0.78);
  ctx.lineWidth = compact ? 1.4 : size * 0.07;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, compact ? 1.4 : size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
}

export async function analogIconImageData(hour, minute, size = 128) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  drawAnalogClock(ctx, size, hour, minute);
  return ctx.getImageData(0, 0, size, size);
}
