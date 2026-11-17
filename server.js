const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { normalizeGiftPayload, getGiftComboDelta } = require('./lib/tiktok-gift-payload.cjs');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. ระบบ EVOLUTION 4 ระดับขององค์เจ้าพ่อเห้งเจีย (SUN WUKONG 4-STAGE EVOLUTION)
// ============================================================================
const EVOLUTION_LEVELS = [
  {
    level: 1,
    code: 'LV1',
    name: 'ปางที่ 1: มุ้ยเกาอ๋อง (美猴王)',
    shortName: 'มุ้ยเกาอ๋อง • ถ้ำม่านน้ำตก',
    chineseTitle: '美猴王 • 水簾洞',
    subtitle: 'พญาวานรแห่งถ้ำม่านน้ำตก ผู้ถือผลท้อสวรรค์อมตะ',
    image: '/assets/wukong/LV1.jpg',
    minExp: 0,
    nextExp: 1000,
    meritMultiplier: 1.0,
    auraColor: '#ffd54f',
    blessingSpeech: 'องค์เจ้าพ่อเห้งเจีย ปางที่ 1 มุ้ยเกาอ๋อง พญาวานรแห่งถ้ำม่านน้ำตก ประทานพรความคล่องแคล่ว ว่องไว สุขภาพแข็งแรง'
  },
  {
    level: 2,
    code: 'LV2',
    name: 'ปางที่ 2: พญาวานรเหินเมฆา (筋斗云)',
    shortName: 'เหินเมฆาทอง • กระบองวิเศษ',
    chineseTitle: '美猴王 • 如意金箍棒',
    subtitle: 'เหยียบเมฆมงคลสีทอง ถือกระบองวิเศษรู่อี่จินกูบังค้ำฟ้า',
    image: '/assets/wukong/LV2.jpg',
    minExp: 1000,
    nextExp: 5000,
    meritMultiplier: 1.25,
    auraColor: '#ffb300',
    blessingSpeech: 'บารมีศรัทธาพุ่งทะยาน องค์เจ้าพ่อเห้งเจียอัพระดับสู่ ปางที่ 2 พญาวานรเหินเมฆาถือกระบองวิเศษ ขอประทานพรให้การงานก้าวหน้า พุ่งทะยานไร้สิ่งกีดขวาง'
  },
  {
    level: 3,
    code: 'LV3',
    name: 'ปางที่ 3: ฉีเทียนต้าเซิ่ง (齐天大圣)',
    shortName: 'ฉีเทียนต้าเซิ่ง • เกราะทองเสมอฟ้า',
    chineseTitle: '齐天大圣 • 火眼金睛',
    subtitle: 'มหาเทพเกราะทองผู้เสมอฟ้า เนตรอัคคีทองปราบหมู่มาร',
    image: '/assets/wukong/LV3.jpg',
    minExp: 5000,
    nextExp: 15000,
    meritMultiplier: 1.5,
    auraColor: '#ff5722',
    blessingSpeech: 'สวรรค์สะเทือนเลือนลั่น องค์เจ้าพ่อเห้งเจียอัพระดับสู่ ปางที่ 3 ฉีเทียนต้าเซิ่ง มหาเทพเกราะทองผู้เสมอฟ้า ขอประทานอำนาจบารมี ชนะศัตรูหมู่มาร ค้าขายร่ำรวยมหาศาล'
  },
  {
    level: 4,
    code: 'LV4',
    name: 'ปางที่ 4: โต้วจั้นเซิ่งฝอ (斗战胜佛)',
    shortName: 'โต้วจั้นเซิ่งฝอ • พุทธะผู้พิชิตมาร',
    chineseTitle: '斗战胜佛 • 大圣佛祖',
    subtitle: 'ต้าเซิ่งฝอจู่ พุทธะผู้พิชิตมาร บรรลุธรรมสูงสุดบนฐานบัวทอง',
    image: '/assets/wukong/LV4.jpg',
    minExp: 15000,
    nextExp: 30000,
    meritMultiplier: 2.0,
    auraColor: '#fff176',
    blessingSpeech: 'มหาบารมีสูงสุดบังเกิด องค์เจ้าพ่อเห้งเจียบรรลุสู่ ปางที่ 4 โต้วจั้นเซิ่งฝอ ต้าเซิ่งฝอจู่ พุทธะผู้พิชิตมาร ขอประทานพรโชคลาภมหาเศรษฐี สมหวังทุกประการทั้งไลฟ์'
  }
];

// ตาราง 4 ระดับการ Donate ของขวัญ TikTok กับแต้มอัพระดับ (ยิ่งมูลค่าสูง ยิ่งได้ตัวคูณโบนัสเร่งขั้นไวแบบก้าวกระโดด)
const GIFT_DONATE_TIERS = [
  {
    tier: 1,
    name: 'ระดับที่ 1: ถวายเครื่องสักการะเริ่มต้น',
    minCoins: 1,
    maxCoins: 9,
    expPerCoin: 15,
    flatExpBonus: 0,
    meritPerCoin: 20,
    speedFactor: '1.0x (ปกติ)',
    examples: [
      { icon: '🌹', giftName: 'ดอกบัว / กุหลาบ', coins: 1, expGain: 15, desc: 'ถวายองค์เห้งเจีย' },
      { icon: '🫰', giftName: 'รูปเทียน / มินิฮาร์ท', coins: 5, expGain: 75, desc: 'จุดประทีปบูชา' }
    ]
  },
  {
    tier: 2,
    name: 'ระดับที่ 2: ถวายเครื่องทรงและผลท้อทิพย์ (เร่งขั้นไว 1.8x)',
    minCoins: 10,
    maxCoins: 99,
    expPerCoin: 25,
    flatExpBonus: 100,
    meritPerCoin: 30,
    speedFactor: '1.8x (อัพระดับไว)',
    examples: [
      { icon: '🎋', giftName: 'เซียมซีส่วนตัว', coins: 20, expGain: 600, desc: 'ใบทำนายขึ้นจอใหญ่' },
      { icon: '🍩', giftName: 'ทองคำแท่ง / ลูกท้อทิพย์', coins: 30, expGain: 850, desc: 'พรใหญ่โชคลาภ (2 ชิ้นขึ้น LV.2)' }
    ]
  },
  {
    tier: 3,
    name: 'ระดับที่ 3: ร่วมบุญใหญ่ กระบองทองค้ำฟ้า (เร่งขั้นไว 3.3x)',
    minCoins: 100,
    maxCoins: 499,
    expPerCoin: 45,
    flatExpBonus: 500,
    meritPerCoin: 50,
    speedFactor: '3.3x (พุ่งข้ามระดับ!)',
    examples: [
      { icon: '🚀', giftName: 'ร่วมบุญใหญ่ / กระบองทอง', coins: 100, expGain: 5000, desc: 'ชื่อขึ้นเต็มจอ • พุ่งสู่ LV.3 ทันที!' }
    ]
  },
  {
    tier: 4,
    name: 'ระดับที่ 4: มหาบุญมังกรทองสวรรค์ (เร่งขั้นสูงสุด 4.5x • Instant LV.4)',
    minCoins: 500,
    maxCoins: 999999,
    expPerCoin: 60,
    flatExpBonus: 2500,
    meritPerCoin: 80,
    speedFactor: '4.5x (ปลดล็อก LV.4 ทันที!)',
    examples: [
      { icon: '🐉', giftName: 'มหาบุญมังกรทอง', coins: 500, expGain: 32500, desc: 'บรรลุ LV.4 โต้วจั้นเซิ่งฝอ + ฉลองทั้งไลฟ์!' }
    ]
  }
];

function resolveDonateTier(coins) {
  const c = Math.max(1, Number(coins) || 1);
  if (c >= 500) return GIFT_DONATE_TIERS[3];
  if (c >= 100) return GIFT_DONATE_TIERS[2];
  if (c >= 10) return GIFT_DONATE_TIERS[1];
  return GIFT_DONATE_TIERS[0];
}

function getEvolutionInfo(exp) {
  const safeExp = Math.max(0, Number(exp) || 0);
  let current = EVOLUTION_LEVELS[0];
  for (const lvl of EVOLUTION_LEVELS) {
    if (safeExp >= lvl.minExp) {
      current = lvl;
    }
  }
  const nextLevelObj = EVOLUTION_LEVELS.find((l) => l.level === current.level + 1) || null;
  let progressPct = 100;
  let currentSpanExp = safeExp - current.minExp;
  let requiredSpanExp = current.nextExp - current.minExp;

  if (nextLevelObj) {
    requiredSpanExp = Math.max(1, nextLevelObj.minExp - current.minExp);
    currentSpanExp = Math.max(0, safeExp - current.minExp);
    progressPct = Math.min(100, Math.round((currentSpanExp / requiredSpanExp) * 100));
  } else {
    // At Max Level 4: cycle overdrive bar every 15,000 EXP
    requiredSpanExp = 15000;
    currentSpanExp = (safeExp - current.minExp) % requiredSpanExp;
    progressPct = Math.min(100, Math.round((currentSpanExp / requiredSpanExp) * 100));
    if (safeExp >= current.minExp && currentSpanExp === 0) progressPct = 100;
  }

  return {
    level: current.level,
    code: current.code,
    name: current.name,
    shortName: current.shortName,
    chineseTitle: current.chineseTitle,
    subtitle: current.subtitle,
    image: current.image,
    meritMultiplier: current.meritMultiplier,
    auraColor: current.auraColor,
    exp: safeExp,
    minExp: current.minExp,
    nextExp: nextLevelObj ? nextLevelObj.minExp : current.minExp + requiredSpanExp,
    expToNext: nextLevelObj ? Math.max(0, nextLevelObj.minExp - safeExp) : 0,
    progressPct,
    isMaxLevel: !nextLevelObj,
    nextLevelName: nextLevelObj ? nextLevelObj.name : 'บรรลุระดับสูงสุด (โต้วจั้นเซิ่งฝอ)',
    levels: EVOLUTION_LEVELS,
    donateTiers: GIFT_DONATE_TIERS
  };
}

// ============================================================================
// 2. เซียมซีเจ้าพ่อเห้งเจีย 10 ใบมงคล (SUN WUKONG FORTUNE ORACLE DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'เซียมซีใบเอก • มหาโชคสูงสุด (上上签)',
    title: 'อาทิตย์อุทัยเหนือเขาฮัวกั่วซาน (花果山日出)',
    poem: 'แสงทองส่องยอดเขาฮัวกั่วซาน\nหมู่มวลพฤกษาผลิบานรับขวัญ\nชื่อเสียงเงินทองหลั่งไหลครบครัน\nอากงเห้งเจียคุ้มกันภัยพาล',
    meaning: 'สิ่งที่คิดหวังไว้จะสำเร็จอย่างยิ่งใหญ่ การงานก้าวหน้าก้าวกระโดด มีผู้ใหญ่อุปถัมภ์ โชคลาภการเงินหลั่งไหลเข้ามาทุกทิศทาง',
    ttsSummary: 'ได้เซียมซีใบที่ 1 มหาโชคสูงสุด อาทิตย์อุทัยเหนือเขาฮัวกั่วซาน สิ่งที่คิดหวังจะสำเร็จอย่างยิ่งใหญ่ การงานก้าวหน้า โชคลาภการเงินหลั่งไหลครบครัน'
  },
  {
    number: 8,
    rank: 'ดีเยี่ยม • โชคลาภสมบูรณ์ (上吉)',
    title: 'ลูกท้อสวรรค์พันปีประทานพร (蟠桃赐福)',
    poem: 'ผลท้อทิพย์สวรรค์หอมหวานล้ำ\nผู้มีศรัทธาตั้งมั่นในธรรม\nขอโชคได้โชคสมดังถ้อยคำ\nโรคภัยมลายสิ้นบุญหนุนนำ',
    meaning: 'จิตใจตั้งมั่นในความดีจะบังเกิดผลบุญตอบแทนทันตา ขอโชคได้โชค ขอลาภได้ลาภ สุขภาพร่างกายแข็งแรงปราศจากโรคภัย',
    ttsSummary: 'ได้เซียมซีใบที่ 8 ดีเยี่ยม ลูกท้อสวรรค์พันปีประทานพร ขอโชคได้โชค ขอลาภได้ลาภ สุขภาพแข็งแรงบุญหนุนนำ'
  },
  {
    number: 12,
    rank: 'มหาลาภ • พุ่งทะยานไร้พ่าย (大吉)',
    title: 'กระบองวิเศษทองคำค้ำฟ้า (如意金箍棒)',
    poem: 'กระบองทองรู่อี่ส่องประกายกล้า\nฟาดฟันอุปสรรคพ้นทางข้างหน้า\nธุรกิจการค้าเฟื่องฟูหนักหนา\nพลิกฟื้นชะตาสู่ความมั่งมี',
    meaning: 'ดวงชะตากำลังขาขึ้นอย่างแรง ศัตรูหรืออุปสรรคใดๆ มิอาจขวางกั้น การสอบแข่งขันและการค้าขายจะชนะคู่แข่งขาดลอย',
    ttsSummary: 'ได้เซียมซีใบที่ 12 มหาลาภ กระบองวิเศษทองคำค้ำฟ้า ดวงชะตาขาขึ้นอย่างแรง การค้าขายชนะคู่แข่ง พลิกชะตาสู่ความมั่งมี'
  },
  {
    number: 18,
    rank: 'ดีเยี่ยม • เดินทางราบรื่น (上吉)',
    title: 'เหินเมฆาหมื่นลี้สมปรารถนา (筋斗云万里)',
    poem: 'เมฆาทองพัดพาสู่ฟากฟ้าไกล\nจะไปทิศทางใดมีชัยทุกที่\nโชคลาภก้อนใหญ่กำลังจะมี\nกัลยาณมิตรไมตรีเกื้อกูลกัน',
    meaning: 'การเดินทางและการติดต่องานทางไกลประสบผลสำเร็จงดงาม การค้าออนไลน์และการเจรจาธุรกิจราบรื่นได้กำไรเกินคาด',
    ttsSummary: 'ได้เซียมซีใบที่ 18 ดีเยี่ยม เหินเมฆาหมื่นลี้สมปรารถนา การติดต่องานและการค้าขายราบรื่น โชคลาภก้อนใหญ่กำลังมาถึง'
  },
  {
    number: 24,
    rank: 'ดีปานกลาง • พ้นเคราะห์พบสุข (中吉)',
    title: 'ถ้ำม่านน้ำตกพ้นภัยพาล (水簾洞天)',
    poem: 'ผ่านพ้นม่านน้ำตกพบดินแดนทอง\nความทุกข์หม่นหมองมลายหายไป\nตั้งสติอดทนอีกเพียงอึดใจ\nฟ้าหลังฝนสดใสรับทรัพย์แน่นอน',
    meaning: 'เรื่องหนักใจที่ผ่านมาจะคลี่คลายลงอย่างรวดเร็ว ขอเพียงมีสติและอดทน ความโชคดีและโอกาสใหม่กำลังเปิดรออยู่ตรงหน้า',
    ttsSummary: 'ได้เซียมซีใบที่ 24 ดีปานกลาง ถ้ำม่านน้ำตกพ้นภัยพาล เรื่องหนักใจกำลังคลี่คลาย ฟ้าหลังฝนสดใสรับทรัพย์แน่นอน'
  },
  {
    number: 36,
    rank: 'มหาโชคสูงสุด • ดวงดาวนำทรัพย์ (上上签)',
    title: 'เนตรอัคคีทองส่องขุมทรัพย์ (火眼金睛)',
    poem: 'เนตรอัคคีทองคำส่องทะลุฟ้า\nแยกแยะคนพาลนำพาคนดี\nมองเห็นช่องทางสร้างทรัพย์ทวี\nเงินทองมั่งมีเข้าบ้านทุกวัน',
    meaning: 'องค์เจ้าพ่อเห้งเจียประทานสติปัญญาเฉียบแหลม จะมองเห็นโอกาสทำเงินที่คนอื่นมองไม่เห็น แคล้วคลาดจากคนคิดร้ายและมิจฉาชีพ',
    ttsSummary: 'ได้เซียมซีใบที่ 36 มหาโชคสูงสุด เนตรอัคคีทองส่องขุมทรัพย์ จะมองเห็นโอกาสสร้างเงินทองมั่งมี แคล้วคลาดจากภัยทั้งปวง'
  },
  {
    number: 52,
    rank: 'ดีเยี่ยม • พลิกร้ายกลายดี (上吉)',
    title: 'เจ็ดสิบสองอิทธิฤทธิ์พลิกชะตา (七十二变)',
    poem: 'เจ็ดสิบสองวิชาอิทธิฤทธิ์เกรียงไกร\nพลิกเรื่องร้ายกลายเป็นดีทันใด\nความเพียรที่สร้างมาเนิ่นนานไซร้\nวันนี้ผลิดอกออกผลงดงาม',
    meaning: 'ความเหน็ดเหนื่อยที่ทุ่มเทมาตลอดกำลังจะออกดอกออกผลอย่างคุ้มค่า ปัญหาที่ดูเหมือนยากจะแก้ไขได้สำเร็จอย่างน่าอัศจรรย์',
    ttsSummary: 'ได้เซียมซีใบที่ 52 ดีเยี่ยม เจ็ดสิบสองอิทธิฤทธิ์พลิกชะตา พลิกเรื่องร้ายกลายเป็นดี ความเพียรพยายามจะเกิดผลสำเร็จงดงาม'
  },
  {
    number: 68,
    rank: 'มหาลาภ • เปิดคลังสมบัติ (大吉)',
    title: 'ฉีเทียนต้าเซิ่งเปิดคลังสวรรค์ (齐天大圣)',
    poem: 'ฉีเทียนต้าเซิ่งเปิดคลังทองคำ\nโภคทรัพย์เนืองนองไหลมาเทมา\nยิ่งทำบุญทานด้วยจิตศรัทธา\nยิ่งรวยล้นฟ้าสมบูรณ์พูนผล',
    meaning: 'โดดเด่นที่สุดด้านการเงิน โชคลาภลอย และการค้าขาย ยิ่งแบ่งปันทำบุญกุศล บารมีทรัพย์จะยิ่งทวีคูณมั่นคง',
    ttsSummary: 'ได้เซียมซีใบที่ 68 มหาลาภ ฉีเทียนต้าเซิ่งเปิดคลังสวรรค์ โภคทรัพย์เงินทองไหลมาเทมา ค้าขายร่ำรวยล้นฟ้า'
  },
  {
    number: 81,
    rank: 'ดีเยี่ยม • ความรักและครอบครัว (上吉)',
    title: 'ผ่านพ้นอุปสรรคบรรลุความสุข (九九归真)',
    poem: 'จันทร์เพ็ญส่องสว่างกลางนภาใส\nครอบครัวอบอุ่นอิ่มเอมหัวใจ\nคนโสดพบคู่แท้ร่วมทางไกล\nสมบูรณ์พูนสุขไร้เรื่องกังวล',
    meaning: 'ความรักและครอบครัวร่มเย็นเป็นสุข คนโสดมีเกณฑ์ได้พบคู่ครองที่ดีเกื้อหนุนกัน คนมีคู่จะเข้าใจกันและมีข่าวดีในบ้าน',
    ttsSummary: 'ได้เซียมซีใบที่ 81 ดีเยี่ยม ครอบครัวอบอุ่นร่มเย็น คนโสดจะได้พบคู่แท้เกื้อหนุนกัน สมบูรณ์พูนสุข'
  },
  {
    number: 99,
    rank: 'มหาโชคสูงสุด • พุทธะประทานพร (上上签)',
    title: 'โต้วจั้นเซิ่งฝอ พิชิตมารบรรลุธรรม (斗战胜佛)',
    poem: 'รัศมีดอกบัวทองส่องเก้าชั้นฟ้า\nโต้วจั้นเซิ่งฝอเมตตาประทาน\nผู้มีจิตศรัทธากราบไหว้สักการ\nเจริญรุ่งเรืองชั่วกาลนานเทอญ',
    meaning: 'ใบเซียมซีสูงสุดแห่งศาลเจ้าพ่อเห้งเจีย ประทานพรครบทั้งอำนาจ วาสนา บารมี เงินทอง และอายุวัฒนะ สมปรารถนาทุกประการ',
    ttsSummary: 'ได้เซียมซีใบที่ 99 มหาโชคสูงสุด โต้วจั้นเซิ่งฝอ พุทธะผู้พิชิตมารประทานพรสูงสุด เจริญรุ่งเรืองมั่งคั่งสมปรารถนาทุกประการ'
  }
];

// ============================================================================
// 3. THAI TTS PYTHON WORKER MANAGER (ZeroTTSManager class name kept for audit compatibility)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'thai_female';
    this.voices = ['thai_female', 'thai_vits'];
    this.model = 'Thai Neural TTS (VITS-MMS-THA ONNX + Google Thai TTS)';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    if (process.env.DISABLE_ZEROTTS_WORKER === '1') {
      this.status = 'disabled';
      return;
    }
    this.startWorker();
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ThaiTTS] กำลังเริ่มต้นโมเดลเสียงภาษาไทยด้วย ${pyBin}...`);

    this.status = 'loading';
    this.proc = spawn(pyBin, [scriptPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ThaiTTS stderr] ${msg}`);
    });

    this.proc.on('exit', (code) => {
      console.warn(`[ThaiTTS] Worker exited with code ${code}`);
      this.ready = false;
      this.status = 'stopped';
      for (const [, item] of this.pending) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: 'ThaiTTS worker exited' });
      }
      this.pending.clear();
    });
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'thai_female';
        this.voices = msg.voices || ['thai_female', 'thai_vits'];
        this.model = msg.model || this.model;
        console.log(`[ThaiTTS] พร้อมใช้งานใน ${msg.loadSec}s! เสียง: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ThaiTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (_) {
      console.log('[ThaiTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'Thai Neural TTS (VITS-MMS-THA ONNX + Google Thai)',
      voice: state.settings.ttsVoice || this.voice || 'thai_female',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    let voice = (voiceOverride || state.settings.ttsVoice || 'thai_female').toLowerCase();
    if (!['thai_female', 'thai_vits'].includes(voice)) {
      voice = 'thai_female';
    }
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ThaiTTS status: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ThaiTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 4. STATE ศาลเจ้าพ่อเห้งเจีย & กระดานสายบุญตัวจริง
// ============================================================================
const DEFAULT_DEVOTEES = {
  bird_888: {
    name: 'เบิร์ด สายบุญ',
    uniqueId: 'bird_888',
    avatar: '',
    merit: 12253,
    incense: 27,
    gifts: 9,
    lastWish: 'ขอองค์เจ้าพ่อเห้งเจียประทานพรให้ค้าขายร่ำรวย ปังๆ ตลอดปี'
  },
  victor_3: {
    name: 'เอ็ด victor 3',
    uniqueId: 'victor_3',
    avatar: '',
    merit: 7106,
    incense: 18,
    gifts: 5,
    lastWish: 'สาธุ ขอโชคลาภก้อนใหญ่ สุขภาพแข็งแรงทั้งครอบครัวครับ'
  },
  alongkorn: {
    name: 'Alongkorn99',
    uniqueId: 'alongkorn',
    avatar: '',
    merit: 1889,
    incense: 9,
    gifts: 2,
    lastWish: 'ขอนอบน้อมแด่องค์ฉีเทียนต้าเซิ่ง ขอให้งานราบรื่นไร้อุปสรรค'
  }
};

const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 21248,
  evolutionExp: 477,
  faithToday: 477,
  faithTarget: 1000,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  haloIntensity: 0.55,
  offerings: {
    lotus: 12,
    fruit: 8,
    lamp: 9,
    dragon: 2
  },
  devotees: DEFAULT_DEVOTEES,
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'thai_female',
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9000
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'wukong_shrine_th',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees && Object.keys(saved.devotees).length > 0 ? saved.devotees : DEFAULT_DEVOTEES,
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] อ่านไฟล์ merit-state.json ไม่สำเร็จ ใช้ค่าเริ่มต้น:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      evolutionExp: state.evolutionExp,
      faithToday: state.faithToday,
      faithTarget: state.faithTarget,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      activeIncenseSticks: state.activeIncenseSticks,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] บันทึกไฟล์ไม่สำเร็จ:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.devotees)
    .sort((a, b) => b.merit - a.merit)
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      merit: d.merit,
      incense: d.incense || 0,
      lastWish: d.lastWish || ''
    }));
}

// ตัวกรองข้อความสแปมและคำไม่สุภาพ (รองรับภาษาไทย อังกฤษ จีน และเวียดนาม)
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_TEXT_RE = /[^0-9a-zA-Z\u0E00-\u0E7F\u4E00-\u9FFFÀ-ỹĂăĐđĨĩŨũƠơƯư\s.,!?]/g;
const ALLOWED_NAME_RE = /[^0-9a-zA-Z\u0E00-\u0E7F\u4E00-\u9FFFÀ-ỹĂăĐđĨĩŨũƠơƯư\s._-]/g;
const VALID_LETTER_RE = /[a-zA-Z\u0E01-\u0E2E\u0E30-\u0E3A\u0E40-\u0E44\u4E00-\u9FFFÀ-ỹ]/g;
const BAD_WORDS_RE = /(ควย|หี|เย็ด|สัส|เหี้ย|พ่อง|แม่มึง|เว็บพนัน|แอดไลน์|telegram|địt|lồn|cặc)/i;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'ผู้ศรัทธาแดนไกล';
  }
  const letters = normalized.match(VALID_LETTER_RE) || [];
  if (letters.length < 1) {
    return 'ผู้ศรัทธาแดนไกล';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 140);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VALID_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

function addEvolutionAndFaith(expDelta = 0, faithDelta = 0) {
  const prevInfo = getEvolutionInfo(state.evolutionExp);
  state.evolutionExp = Math.max(0, (Number(state.evolutionExp) || 0) + Math.max(0, Number(expDelta) || 0));
  const newInfo = getEvolutionInfo(state.evolutionExp);

  state.faithToday = (Number(state.faithToday) || 0) + Math.max(0, Number(faithDelta) || 0);
  let faithGoalReached = false;
  if (state.faithToday >= (state.faithTarget || 1000)) {
    faithGoalReached = true;
    state.faithToday = state.faithToday % (state.faithTarget || 1000);
  }

  let evolutionUp = null;
  if (newInfo.level > prevInfo.level) {
    const unlockedLevelObj = EVOLUTION_LEVELS.find((l) => l.level === newInfo.level) || newInfo;
    evolutionUp = {
      fromLevel: prevInfo.level,
      toLevel: newInfo.level,
      code: newInfo.code,
      name: newInfo.name,
      shortName: newInfo.shortName,
      chineseTitle: newInfo.chineseTitle,
      subtitle: newInfo.subtitle,
      image: newInfo.image,
      blessingSpeech: unlockedLevelObj.blessingSpeech
    };
  }

  return { prevInfo, newInfo, evolutionUp, faithGoalReached };
}

function recordDevotee(user, uniqueId, avatar, baseMeritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      lastWish: ''
    };
  }
  const evoInfo = getEvolutionInfo(state.evolutionExp);
  const finalMeritDelta = Math.max(1, Math.round(baseMeritDelta * (evoInfo.meritMultiplier || 1)));

  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += finalMeritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;

  state.totalMerit += finalMeritDelta;
  state.haloIntensity = Math.min(1.0, 0.4 + evoInfo.level * 0.14);
  return { devotee: dev, meritAdded: finalMeritDelta };
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function getPublicState() {
  const evolution = getEvolutionInfo(state.evolutionExp);
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    evolutionExp: state.evolutionExp,
    evolution,
    faithToday: state.faithToday,
    faithTarget: state.faithTarget || 1000,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'thai_female' }
  };
}

// ============================================================================
// 5. พิธีกรรมและการโต้ตอบในศาลเจ้าพ่อเห้งเจีย (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'ขอนอบน้อมกราบไหว้เจ้าพ่อเห้งเจีย ขอประทานพรให้โชคดีมีชัย ร่ำรวยรุ่งเรือง';
    const baseMerit = count * 5;
    const expGain = count * 3;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, count * 2);
    const { devotee, meritAdded } = recordDevotee(user, uniqueId, avatar, baseMerit, count, 0, wish);

    let ttsText = params.readTts === false
      ? ''
      : `สาธุ ขออนุโมทนาบุญคุณ ${devotee.name} จุดธูปถวายองค์เจ้าพ่อเห้งเจีย ${count} ดอก อธิษฐานว่า ${wish}`;
    if (evolutionUp && ttsText) {
      ttsText += ` ${evolutionUp.blessingSpeech}`;
    }

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const baseMerit = count * 2;
    const expGain = count;

    state.woodenFishHits += count;
    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, count);
    const { devotee, meritAdded } = recordDevotee(user, uniqueId, avatar, baseMerit, 0, 0);

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      ttsText: params.ttsText || (evolutionUp ? evolutionUp.blessingSpeech : '')
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'ตีระฆังทองเบิกฟ้า ขอองค์ฉีเทียนต้าเซิ่งประทานสติปัญญาและโชคลาภ';
    const baseMerit = count * 12;
    const expGain = count * 10;

    state.bellRings += count;
    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, count * 5);
    const { devotee, meritAdded } = recordDevotee(user, uniqueId, avatar, baseMerit, 0, 0, wish);

    let ttsText = params.readTts
      ? `คุณ ${devotee.name} ตีระฆังทองคำถวายเจ้าพ่อเห้งเจีย ${wish}`
      : '';
    if (evolutionUp) {
      ttsText = ttsText ? `${ttsText} ${evolutionUp.blessingSpeech}` : evolutionUp.blessingSpeech;
    }

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'ขอพรองค์เจ้าพ่อเห้งเจีย ประทานความสำเร็จ ร่ำรวยเงินทอง สุขภาพแข็งแรง';
    const baseMerit = 15;
    const expGain = 10;

    state.lanternCount += 1;
    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, 5);
    const { devotee, meritAdded } = recordDevotee(user, uniqueId, avatar, baseMerit, 1, 0, wish);

    let ttsText = params.readTts === false
      ? ''
      : `คำอธิษฐานของคุณ ${devotee.name} ขอพรว่า ${wish} ขอให้สมปรารถนาทุกประการ สาธุ`;
    if (evolutionUp && ttsText) {
      ttsText += ` ${evolutionUp.blessingSpeech}`;
    }

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      wish,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const tierInfo = resolveDonateTier(coins);

    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'ดอกบัวทองคำบูชาองค์เทพ',
      lamp: 'เทียนประทีปมงคล',
      fruit: 'ทองคำแท่งและผลท้อสวรรค์พันปี',
      dragon: 'มังกรทองสวรรค์และกระบองวิเศษค้ำฟ้า'
    };
    const giftName = params.giftName || giftLabels[giftType];

    // คำนวณแต้มอัพระดับองค์เทพ (EXP) และแต้มบุญตามระดับมูลค่าของขวัญ 4 ระดับ
    const expGain = coins * tierInfo.expPerCoin + tierInfo.flatExpBonus;
    const baseMerit = Math.max(20, coins * tierInfo.meritPerCoin);
    const faithGain = Math.min(500, Math.max(5, coins * 3));

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, faithGain);
    const wish = params.wish || `ถวาย ${giftName} แด่องค์เจ้าพ่อเห้งเจีย`;
    const { devotee, meritAdded } = recordDevotee(user, uniqueId, avatar, baseMerit, 3, 1, wish);

    let ttsText = params.readTts === false
      ? ''
      : `อนุโมทนาบุญใหญ่ ขอบพระคุณคุณ ${devotee.name} ร่วมถวาย ${giftName} เพิ่มพลังบารมีองค์เทพ ${expGain} แต้ม และรับแต้มบุญ ${meritAdded} คะแนน ขอองค์เจ้าพ่อเห้งเจียประทานพรให้ร่ำรวยมหาศาล`;
    if (evolutionUp && params.readTts !== false) {
      ttsText += ` ${evolutionUp.blessingSpeech}`;
    }

    const event = pushEventLog({
      type: giftType === 'dragon' || coins >= 100 ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      giftType,
      giftId: params.giftId == null ? '' : String(params.giftId).slice(0, 80),
      giftName,
      giftTier: tierInfo.tier,
      giftTierName: tierInfo.name,
      giftGroupId: params.giftGroupId ? String(params.giftGroupId).slice(0, 180) : '',
      giftComboDelta: Math.max(1, Number(params.giftComboDelta) || 1),
      giftRepeatCount: Math.max(1, Number(params.giftRepeatCount) || 1),
      giftRepeatEnd: Boolean(params.giftRepeatEnd),
      giftStreakable: Boolean(params.giftStreakable),
      coins,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'โชคลาภ การงาน และความสำเร็จ';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const baseMerit = 15;
    const expGain = 10;

    state.fortuneCount += 1;
    const { evolutionUp, faithGoalReached } = addEvolutionAndFaith(expGain, 5);
    const { devotee, meritAdded } = recordDevotee(
      user,
      uniqueId,
      avatar,
      baseMerit,
      0,
      0,
      `เสี่ยงเซียมซี: ใบที่ ${fortune.number} (${fortune.rank})`
    );

    const ttsText = params.readTts === false
      ? ''
      : `คุณ ${devotee.name} เสี่ยงเซียมซีเจ้าพ่อเห้งเจีย ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      topic,
      fortune,
      merit: meritAdded,
      expGain,
      evolutionUp,
      faithGoalReached,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    if (evolutionUp) {
      broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    }
    return { event, state: pubState };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 500),
      giftName: params.giftName || 'มหาบุญมังกรทองสวรรค์ ถวายองค์เจ้าพ่อเห้งเจีย'
    });
  },

  setEvolutionLevel(params = {}) {
    const targetLevel = Math.max(1, Math.min(4, Number(params.level) || 1));
    const prevInfo = getEvolutionInfo(state.evolutionExp);
    const levelObj = EVOLUTION_LEVELS.find((l) => l.level === targetLevel) || EVOLUTION_LEVELS[0];
    state.evolutionExp = params.exp != null ? Math.max(0, Number(params.exp)) : levelObj.minExp;
    const newInfo = getEvolutionInfo(state.evolutionExp);

    const evolutionUp = {
      fromLevel: prevInfo.level,
      toLevel: newInfo.level,
      code: newInfo.code,
      name: newInfo.name,
      shortName: newInfo.shortName,
      chineseTitle: newInfo.chineseTitle,
      subtitle: newInfo.subtitle,
      image: newInfo.image,
      blessingSpeech: levelObj.blessingSpeech
    };

    const ttsText = params.readTts === false ? '' : levelObj.blessingSpeech;
    const event = pushEventLog({
      type: 'evolutionChange',
      user: sanitizeUserName(params.user || 'เจ้าพิธีศาลเจ้าพ่อเห้งเจีย'),
      merit: 0,
      expGain: 0,
      evolutionUp,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'thai_female'
    });

    saveState();
    const pubState = getPublicState();
    broadcastNotification('temple.event', { event, state: pubState });
    broadcastNotification('temple.evolution', { evolutionUp, state: pubState });
    return { event, state: pubState };
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.evolutionExp = 0;
    state.faithToday = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 6. TIKTOK LIVE CONNECTOR & THAI COMMENT PARSER
// ============================================================================
let tiktokConn = null;
const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 2) {
    return null;
  }

  // Cooldown 3.5 วินาทีต่อผู้ใช้ เพื่อป้องกันการสแปมคิว TTS
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. เสี่ยงเซียมซี / ดูคำทำนาย
  if (
    lower.includes('เซียมซี') ||
    lower.includes('ทำนาย') ||
    lower.includes('ดูดวง') ||
    lower.includes('ขอหวย') ||
    lower.includes('เลขเด็ด') ||
    lower.includes('xin xăm') ||
    lower.includes('gieo quẻ')
  ) {
    return Rituals.drawFortune({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. ตีระฆังทอง
  if (lower.includes('ระฆัง') || lower.includes('ตีระฆัง') || lower.includes('chuông')) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. เคาะปักฮื้อ / เคาะเกราะไม้มงคล
  if (lower.includes('ปักฮื้อ') || lower.includes('เคาะไม้') || lower.includes('สวดมนต์') || lower.includes('gõ mõ')) {
    return Rituals.strikeWoodenFish({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. ปล่อยโคมลอยอธิษฐาน
  if (
    lower.includes('โคม') ||
    lower.includes('ปล่อยโคม') ||
    lower.includes('อธิษฐาน')
  ) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  // 5. พิมพ์อะไรก็ได้ในแชท -> เดินไปไหว้และจุดธูปถวายองค์เจ้าพ่อเห้งเจีย (ตามแบบ Ref Interactive UI)
  return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
}

const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('กรุณากรอก @username หรือลิงก์ห้อง TikTok Live');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'สายบุญ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('ไม่พบ @username ที่ถูกต้อง');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  giftComboTracker.clear();

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  const connection = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });
  tiktokConn = connection;

  const isCurrentConnection = () => tiktokConn === connection;

  connection.on(ControlEvent.CONNECTED, (roomState) => {
    if (!isCurrentConnection()) return;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] เชื่อมต่อห้อง @${cleanUser} สำเร็จ (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (!isCurrentConnection()) return;
    giftComboTracker.clear();
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] ตัดการเชื่อมต่อ @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(ControlEvent.ERROR, (err) => {
    if (!isCurrentConnection()) return;
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(WebcastEvent.ROOM_USER, (data) => {
    if (!isCurrentConnection()) return;
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  connection.on(WebcastEvent.MEMBER, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'เดินทางเข้าสู่ศาลเจ้าพ่อเห้งเจีย');
    broadcastNotification('temple.state', getPublicState());
  });

  connection.on(WebcastEvent.CHAT, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  connection.on(WebcastEvent.LIKE, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    Rituals.strikeWoodenFish({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'กัลยาณมิตรร่วมแชร์สะพานบุญ ศาลเจ้าพ่อเห้งเจีย',
      readTts: false
    });
  };
  connection.on(WebcastEvent.FOLLOW, handleSocialEvent);
  connection.on(WebcastEvent.SHARE, handleSocialEvent);
  connection.on(WebcastEvent.SOCIAL, (data) => {
    if (!isCurrentConnection()) return;
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });

  connection.on(WebcastEvent.GIFT, (data) => {
    if (!isCurrentConnection()) return;
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftPayload = normalizeGiftPayload(data, uniqueId);
    const {
      giftId, giftName: rawGiftName, diamondCount, repeatCount, repeatEnd, groupId
    } = giftPayload;

    const deltaCount = getGiftComboDelta(giftComboTracker, giftPayload);
    if (deltaCount <= 0) {
      if (repeatEnd && groupId) {
        broadcastNotification('temple.gift-streak-end', { groupId });
      }
      return;
    }

    const totalCoins = diamondCount * deltaCount;
    const displayGiftName = rawGiftName
      ? (deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName)
      : '';

    console.log(`[TikTok Gift] ${user} ส่ง ${displayGiftName || 'ของขวัญ'} (${totalCoins} Coins)`);

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      giftId,
      coins: totalCoins,
      giftName: displayGiftName,
      giftGroupId: groupId,
      giftComboDelta: deltaCount,
      giftRepeatCount: repeatCount,
      giftRepeatEnd: repeatEnd,
      giftStreakable: giftPayload.streakable,
      wish: `ถวาย ${displayGiftName || 'ของขวัญมงคล'} แด่องค์เจ้าพ่อเห้งเจีย`
    });
  });

  try {
    const roomState = await connection.connect();
    if (!isCurrentConnection()) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    const message = err?.message || 'ไม่สามารถเชื่อมต่อห้อง Live ได้ (ตรวจสอบว่าบัญชีเปิด Live อยู่หรือไม่)';
    if (isCurrentConnection()) {
      giftComboTracker.clear();
      state.tiktok.connected = false;
      state.tiktok.connecting = false;
      state.tiktok.lastError = message;
      broadcastNotification('temple.state', getPublicState());
    }
    throw new Error(message);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  giftComboTracker.clear();
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 7. AUTO-SIMULATION ENGINE (จำลองผู้ชมและสายบุญส่งของขวัญภาษาไทยอัตโนมัติ)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'พลอย สายมู888', uniqueId: 'ploy_mu888', wish: 'ขอองค์เจ้าพ่อเห้งเจียประทานโชคลาภ ค้าขายออนไลน์ปังๆ รวยๆ ค่ะ' },
  { user: 'เฮียหมู เยาวราช', uniqueId: 'hiamoo_gold', wish: 'ขอนอบน้อมองค์ฉีเทียนต้าเซิ่ง ขอให้ธุรกิจราบรื่น กำไรหลักล้านครับ' },
  { user: 'เมย์ มั่งคั่ง99', uniqueId: 'may_rich99', wish: 'สาธุ ขอให้ครอบครัวสุขภาพแข็งแรง ถูกหวยรางวัลใหญ่ค่ะ' },
  { user: 'ก้องภพ สายบุญ', uniqueId: 'kongphop_dev', wish: 'ขอพรอากงเห้งเจีย ประทานสติปัญญา เลื่อนตำแหน่งการงานก้าวหน้า' },
  { user: 'เจ๊หงส์ ทองเยาวราช', uniqueId: 'jehong_gold', wish: 'ถวายผลท้อสวรรค์และทองคำแท่ง ขอให้ยอดขายทะลุเป้าทุกวันค่ะ' },
  { user: 'ต้นกล้า มหาเฮง', uniqueId: 'tonkla_heng', wish: 'ลูกขอเสี่ยงเซียมซีถามเรื่องโชคลาภและการเงินเดือนนี้ครับ' }
];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const roll = Math.random();
  if (roll < 0.28) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.48) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.68) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 5, giftName: 'รูปเทียนประทีปมงคล' });
  } else if (roll < 0.88) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'fruit', coins: 30, giftName: 'ทองคำแท่งและลูกท้อสวรรค์' });
  } else {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'dragon', coins: 100, giftName: 'ร่วมบุญใหญ่ กระบองทองค้ำฟ้า' });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9000);
  }
}

// ============================================================================
// 8. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.getEvolutionTable':
      return {
        levels: EVOLUTION_LEVELS,
        donateTiers: GIFT_DONATE_TIERS,
        current: getEvolutionInfo(state.evolutionExp)
      };
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.setEvolutionLevel':
      return Rituals.setEvolutionLevel(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'thai_female');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`ไม่พบเมธอด JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 9. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  })
);

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: missing method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'thai_female').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'กรุณาระบุข้อความภาษาไทยที่ต้องการอ่าน' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🐒 ศาลเจ้าพ่อเห้งเจีย (ซุนหงอคง 孙悟空) TIKTOK LIVE RPC พร้อมใช้งาน`);
  console.log(`📺 หน้าจอ Live 9:16 (OBS): http://localhost:${PORT}`);
  console.log(`🎛️ หน้าจอควบคุม Admin RPC : http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Visual/browser audits can opt out of external live connections.
  if (process.env.DISABLE_TIKTOK_AUTOCONNECT !== '1') {
    const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'wukong_shrine_th';
    if (defaultChannel) {
      connectTikTokLive(defaultChannel).catch((err) => {
        console.warn(`[Auto-Connect @${defaultChannel}] ยังไม่ได้เชื่อมต่อห้องสด:`, err.message);
      });
    }
  }
});
