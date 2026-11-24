// Rebuild app icons, splash and favicon from assets/images/logo-source.png:  node scripts/make-icons.js
// Recolour the GymTrack logo for the app's dark theme: white background -> app bg,
// dark parts (plates, arc, "Gym") -> app text white, greens -> app neon lime. Anti-aliasing kept.
const Jimp = require('jimp-compact');
const dir = require('path').join(__dirname, '..', 'assets', 'images') + '/';
const BG = [0x0a, 0x0b, 0x0f], TEXT = [0xf5, 0xf7, 0xfb], LIME = [0xc6, 0xff, 0x3d], ARC = [0x5a, 0x61, 0x72];
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
const clamp = (x) => Math.max(0, Math.min(1, x));
(async () => {
  const src = await Jimp.read(dir + 'logo-source.png');
  src.scan(0, 0, src.bitmap.width, src.bitmap.height, function (x, y, i) {
    const d = this.bitmap.data, r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let out;
    if (g === max && g - Math.max(r, b) > 25) {
      // green on white: blue channel tells how much green covers the pixel
      out = mix(BG, LIME, clamp((250 - b) / 215));
    } else {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const a = clamp((245 - lum) / 205);
      // the navy arc (bluish) gets a softer grey so the barbell stands out
      const navy = y < this.bitmap.height * 0.675 && b - r > 18 && max - min > 18;
      out = mix(BG, navy ? ARC : TEXT, a);
    }
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
  });
  const bg = Jimp.rgbaToInt(...BG, 255);
  const fit = async (canvas, size) => {
    const c = await Jimp.create(canvas, canvas, bg);
    c.composite(src.clone().resize(size, size, Jimp.RESIZE_BICUBIC), (canvas - size) / 2, (canvas - size) / 2);
    return c;
  };
  await (await fit(1024, 1024)).writeAsync(dir + 'icon.png');
  await (await fit(1024, 700)).writeAsync(dir + 'android-icon-foreground.png');
  await (await Jimp.create(1024, 1024, bg)).writeAsync(dir + 'android-icon-background.png');
  await src.clone().resize(48, 48, Jimp.RESIZE_BICUBIC).writeAsync(dir + 'favicon.png');
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });

// In-app logos with a transparent background, one per theme (src/components/Logo.tsx).
(async () => {
  const src = await Jimp.read(dir + 'logo-source.png');
  const W = src.bitmap.width, H = src.bitmap.height;
  const onDark = src.clone(), onLight = src.clone();
  const LIGHT_LIME = [0x4f, 0x8f, 0x00], LIGHT_TEXT = [0x0f, 0x12, 0x18], LIGHT_ARC = [0x8f, 0x96, 0xa6];
  const DARK_TEXT = [0xf5, 0xf7, 0xfb], DARK_LIME = [0xc6, 0xff, 0x3d], DARK_ARC = [0x5a, 0x61, 0x72];
  src.scan(0, 0, W, H, function (x, y, i) {
    const d = this.bitmap.data, r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let a, kind;
    if (g === max && g - Math.max(r, b) > 25) { a = clamp((250 - b) / 215); kind = 'lime'; }
    else {
      a = clamp((245 - (0.299 * r + 0.587 * g + 0.114 * b)) / 205);
      kind = y < H * 0.675 && b - r > 18 && max - min > 18 ? 'arc' : 'text';
    }
    const put = (img, c) => { const o = img.bitmap.data; o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = Math.round(a * 255); };
    put(onDark, kind === 'lime' ? DARK_LIME : kind === 'arc' ? DARK_ARC : DARK_TEXT);
    put(onLight, kind === 'lime' ? LIGHT_LIME : kind === 'arc' ? LIGHT_ARC : LIGHT_TEXT);
  });
  await onDark.resize(512, 512, Jimp.RESIZE_BICUBIC).writeAsync(dir + 'logo-on-dark.png');
  await onLight.resize(512, 512, Jimp.RESIZE_BICUBIC).writeAsync(dir + 'logo-on-light.png');
  console.log('in-app logos ok');
})().catch((e) => { console.error(e); process.exit(1); });
