/** Pure gift-name normalization and visual action selection. */
export function normalizeGiftName(event) {
  return String(event?.giftName || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

export function resolveGiftAction(event) {
  const name = normalizeGiftName(event);
  if (/\b(rocket|ten lua|confetti|hand heart|bouquet|mishka bear|balloon gift box)\b/.test(name) || /(จรวด|กระบองทอง|ร่วมบุญใหญ่)/.test(name)) return 'rocket';
  if (/\b(dragon|rong|money gun|whale|lion|universe|swan)\b/.test(name) || /(มังกร|มหาบุญ|มหาสักการะ)/.test(name)) return 'dragon';
  if (/\b(donut|doughnut|perfume|bubble tea|little crown|paper crane|warm cocoa)\b/.test(name) || /(โดนัท|ทองคำแท่ง|ลูกท้อ|น้ำหอม|เซียมซีส่วนตัว)/.test(name)) return 'donut';
  if (/\b(rose|hoa hong|finger heart|heart me|ice cream cone|tiktok|gg|rosa|applause)\b/.test(name) || /(กุหลาบ|ดอกบัว|เทียน|มินิฮาร์ท)/.test(name)) return 'rose';
  return null;
}


/**
 * Select a restrained acknowledgement intensity from the actual gift value.
 * Streak delta is incremental, so cumulative TikTok frames are not double-counted.
 */
export function resolveGiftReactionProfile(event = {}) {
  const diamonds = Number(event.diamondCount);
  const delta = Number(event.giftComboDelta);
  const unitValue = Number.isFinite(diamonds) && diamonds > 0 ? diamonds : 1;
  const count = Number.isFinite(delta) && delta > 0 ? Math.min(10000, Math.floor(delta)) : 1;
  const total = Math.min(1000000, unitValue * count);
  if (total >= 1000) return { tier: 'special', totalDiamonds: total, durationMs: 3800, intensity: 1, bowAmount: 0.3 };
  if (total >= 500) return { tier: 'large', totalDiamonds: total, durationMs: 3000, intensity: 0.88, bowAmount: 0.22 };
  if (total >= 100) return { tier: 'medium', totalDiamonds: total, durationMs: 2300, intensity: 0.72, bowAmount: 0.14 };
  return { tier: 'small', totalDiamonds: total, durationMs: 1800, intensity: 0.55, bowAmount: 0.08 };
}
