// Truth model for "Fig 01 — The 4 km link".
// A pure free-space link budget for the EEPISAT CanSat downlink. Every number the
// figure shows (readout, needle, ruler, dot sizes, meter zones, legend, caption)
// comes from here. This file is inlined into assets/js/fig-link.js by build.mjs,
// so keep it dependency-free and use only `export const` / `export function`.

export const F_MHZ = 915; // XBee-PRO 900HP, 902-928 MHz ISM band
export const LAMBDA_MM = 299792.458 / F_MHZ; // 327.6 mm
export const TX_DBM = 24; // XBee-PRO 900HP (S3B) at full power, 250 mW
export const G_CAN_DBI = 2.15; // the whip on the can

// Ground-station antennas. The Moxon–Yagi has seven elements on a PVC boom about
// 1.3 λ long: two complete Moxon rectangles of bent aluminium rod, one behind the
// other (each two U halves, tips facing across a small gap), the rear one the
// reflector and the front one the driven element, then five straight dipole
// directors, each a little shorter than the one before. The owner's figure is
// about 11 dBi.
export const G_YAGI_DBI = 11;
export const ELEMENTS = 7;
export const G_STOCK_DBI = 2.15; // the XBee's stock whip

// XBee-PRO 900HP receiver sensitivity by RF data rate.
export const RATE_FAST_KBPS = 200;
export const RATE_SLOW_KBPS = 10;
export const SENS_FAST_DBM = -101;
export const SENS_SLOW_DBM = -110;

export const LOSS_DB = 1.5; // coax, SMA pigtail and connectors
export const FADE_DB = 20; // reserve held back for fades, marked on the meter
export const FIELD_KM = 4; // the stable link of the field test: the far end of the rail
export const D_MIN_KM = 0.1;
export const D_MAX_KM = 4;
export const STOPS_KM = [0.1, 0.5, 1, 2, 3, 4];

// Meter scale (dBm) and its sweep.
export const METER_LOW = -120;
export const METER_HIGH = -30;

// `yagi` and `slow` run 0..1 so the figure can ease between states:
// yagi 1 = Moxon–Yagi deployed, 0 = stock whip; slow 1 = 10 kb/s, 0 = 200 kb/s.
export const gainOf = (yagi = 1) => G_STOCK_DBI + (G_YAGI_DBI - G_STOCK_DBI) * yagi;
export const sensOf = (slow = 0) => SENS_FAST_DBM + (SENS_SLOW_DBM - SENS_FAST_DBM) * slow;

export const fsplDb = (km, mhz = F_MHZ) => 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.44;
export const rxDbm = (km, gain = G_YAGI_DBI) => TX_DBM + G_CAN_DBI + gain - fsplDb(km) - LOSS_DB;
export const marginDb = (km, gain = G_YAGI_DBI, sens = SENS_FAST_DBM) => rxDbm(km, gain) - sens;

// Distance at which the budget leaves `margin` dB (0 = the edge of sensitivity).
export const rangeKm = (margin = 0, gain = G_YAGI_DBI, sens = SENS_FAST_DBM) => Math.pow(10, (TX_DBM + G_CAN_DBI + gain - LOSS_DB - sens - margin - 20 * Math.log10(F_MHZ) - 32.44) / 20);

// Position on the log ruler: 0 at 0.1 km, 1 at 4 km.
export const shareOfKm = (km) => (Math.log10(km) - Math.log10(D_MIN_KM)) / (Math.log10(D_MAX_KM) - Math.log10(D_MIN_KM));
export const kmOfShare = (share) => Math.pow(10, Math.log10(D_MIN_KM) + share * (Math.log10(D_MAX_KM) - Math.log10(D_MIN_KM)));
// A gain change slides every dBm mark along the log ruler by this share.
export const shareOfDb = (db) => db / 20 / (Math.log10(D_MAX_KM) - Math.log10(D_MIN_KM));

const MINUS = "−";
const signed = (value) => (value < 0 ? MINUS + Math.abs(value) : String(value));
const round = (value) => (Math.abs(Math.round(value)) < 1e-9 ? 0 : Math.round(value));

export function kmText(km) {
  if (km < 0.995) return (Math.round(km * 100) / 100).toFixed(2).replace(/0$/, "") + " km";
  return (Math.round(km * 10) / 10).toFixed(1) + " km";
}

export function readoutOf(km, gain = G_YAGI_DBI, sens = SENS_FAST_DBM) {
  return `${kmText(km)} · ${signed(round(rxDbm(km, gain)))} dBm · margin ${round(marginDb(km, gain, sens))} dB`;
}

export const antennaText = (yagi) => (yagi ? `2 Moxon + 5 dir. ≈ ${G_YAGI_DBI} dBi` : `Stock whip ${G_STOCK_DBI} dBi`);
export const rateText = (slow) => (slow ? `${RATE_SLOW_KBPS} kb/s · hears ${signed(SENS_SLOW_DBM)} dBm` : `${RATE_FAST_KBPS} kb/s · hears ${signed(SENS_FAST_DBM)} dBm`);

export function spokenOf(km, yagi = 1, slow = 0) {
  const gain = gainOf(yagi);
  const sens = sensOf(slow);
  const margin = marginDb(km, gain, sens);
  const rx = signed(round(rxDbm(km, gain))).replace(MINUS, "minus ");
  return `CanSat at ${kmText(km).replace("km", "kilometres")}: received ${rx} dBm, ${round(margin)} dB above the receiver's sensitivity${margin < FADE_DB ? ", inside the fade reserve" : ""}.`;
}

export function spokenAntenna(yagi, km, slow = 0) {
  const what = yagi ? `Moxon–Yagi deployed: two Moxon rectangles, reflector and driven element, and five directors, about ${G_YAGI_DBI} dBi` : `Moxon–Yagi folded flat, stock whip up, ${G_STOCK_DBI} dBi`;
  return `${what}. ${spokenOf(km, yagi, slow)}`;
}

export function spokenRate(slow, km, yagi = 1) {
  const what = slow ? `Data rate ${RATE_SLOW_KBPS} kilobits per second, receiver hears down to minus ${-SENS_SLOW_DBM} dBm` : `Data rate ${RATE_FAST_KBPS} kilobits per second, receiver hears down to minus ${-SENS_FAST_DBM} dBm`;
  return `${what}. ${spokenOf(km, yagi, slow)}`;
}
