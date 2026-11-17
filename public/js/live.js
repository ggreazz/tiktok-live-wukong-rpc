import { dispatchGiftSfx } from './gift-sfx-dispatcher.js';
/**
 * Live 9:16 Client Controller — ศาลเจ้าพ่อเห้งเจีย (孙悟空 Sun Wukong) Interactive Sanctuary
 * - ระบบ Evolution องค์เจ้าพ่อเห้งเจีย 4 ระดับ (LV1.jpg -> LV2.jpg -> LV3.jpg -> LV4.jpg)
 * - ระบบของขวัญ TikTok 4 ระดับเร่งการอัพระดับองค์เทพ (ยิ่งมูลค่าสูง ยิ่งอัพระดับไว)
 * - กรอบ UI ซ้าย-ขวาตามต้นฉบับ Ref Interactive UI + ผู้ศรัทธาเดินกราบ 3 จังหวะบนพรมแดง
 * - ระบบอ่านคำอธิษฐานและใบเซียมซีด้วยโมเดลเสียงพูดภาษาไทย (Thai TTS)
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. ย่อ/ขยายกรอบ 1080x1920 ให้พอดีกับหน้าจออัตโนมัติ (9:16)
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');

  function fitStage() {
    if (!stageWrapper || !stage9x16) return;
    const rect = stageWrapper.getBoundingClientRect();
    const scale = rect.width / 1080;
    stage9x16.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // 2. เริ่มต้น Particle Engine (30 FPS) & Thai Audio Engine
  const canvas = document.getElementById('templeCanvas');
  const particles = new window.TempleParticleEngine(canvas);
  const audio = new window.TempleAudioEngine();

  window.addEventListener('temple:gift-sfx', (event) => {
    dispatchGiftSfx(audio, event.detail?.type, event.detail?.effectId);
  });

  audio.onTtsStateChange = (ttsState) => {
    const badge = document.getElementById('ttsSpeakingBadge');
    if (!badge) return;
    if (ttsState?.speaking) {
      badge.textContent = '🔊 กำลังอ่านคำอธิษฐาน...';
      badge.classList.add('speaking');
    } else {
      badge.textContent = '🎙️ เสียงไทยพร้อมอ่าน';
      badge.classList.remove('speaking');
    }
  };

  function unlockAudioOnce() {
    audio.ensureContext();
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '✅ ระบบเสียงศาลเจ้าและเสียงพูดไทยพร้อมทำงาน';
      btnUnlock.classList.remove('gold');
      btnUnlock.classList.add('active-toggle');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // 3. วาดก้านธูปและจุดไฟธูปในกระถางธูปมังกรทอง (x=540, y=1075)
  const incenseHolder = document.getElementById('incenseSticksHolder');
  let renderedStickCount = 0;

  function renderIncenseSticks(count) {
    const target = Math.max(3, Math.min(27, Number(count) || 9));
    if (target === renderedStickCount && incenseHolder.children.length > 0) return;
    renderedStickCount = target;
    incenseHolder.innerHTML = '';

    const tips = [];
    for (let i = 0; i < target; i++) {
      const stick = document.createElement('div');
      stick.className = 'incense-stick';

      const spread = target === 1 ? 0 : (i / (target - 1) - 0.5) * 2;
      const leftPx = 65 + spread * 32 + Math.sin(i * 2.1) * 2;
      const angleDeg = spread * 12 + Math.cos(i * 1.5) * 1.5;
      const heightPx = 78 + (i % 3) * 6;

      stick.style.left = `${leftPx}px`;
      stick.style.height = `${heightPx}px`;
      stick.style.transform = `rotate(${angleDeg}deg)`;

      const ember = document.createElement('div');
      ember.className = 'incense-ember';
      ember.style.animationDelay = `${(i * 0.15) % 1.1}s`;
      stick.appendChild(ember);
      incenseHolder.appendChild(stick);

      const rad = (angleDeg * Math.PI) / 180;
      const tipX = 540 + (leftPx - 65) + Math.sin(rad) * heightPx;
      const tipY = 1075 - Math.cos(rad) * heightPx;
      tips.push({ x: tipX, y: tipY });
    }
    particles.setIncenseTips(tips);
  }

  // 4. ตำแหน่งเบาะกราบ VIP ของสายบุญหน้ากระถางธูปมังกรทอง (เหมือนใน Ref Interactive UI)
  const VIP_CUSHION_COORDS = [
    { x: 325, y: 1455, rank: 1 },
    { x: 755, y: 1455, rank: 2 },
    { x: 265, y: 1585, rank: 3 },
    { x: 815, y: 1585, rank: 4 },
    { x: 225, y: 1710, rank: 5 },
    { x: 855, y: 1710, rank: 6 }
  ];

  function renderVipCushions(leaderboard = []) {
    const layer = document.getElementById('vipCushionsLayer');
    if (!layer) return;

    layer.innerHTML = VIP_CUSHION_COORDS.map((slot, idx) => {
      const dev = leaderboard[idx];
      if (!dev) return '';
      return `
        <div class="vip-devotee-slot" style="left: ${slot.x}px; top: ${slot.y}px; z-index: ${13 + idx};">
          <img src="/assets/devotee.png" alt="VIP Devotee" class="devotee-sprite" />
          <div class="vip-rank-pill">
            <span class="vip-rank-num">${slot.rank}</span>
            <span class="vip-rank-name">${escapeHtml(shortenName(dev.name, 12))}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. ผู้ศรัทธาที่นั่งรายล้อมเบาะแดงหน้าแท่นประทับ
  const congregationHall = document.getElementById('congregationHall');
  const HALL_SEAT_COORDS = [
    { side: 'L', row: 0, x: 375, y: 1520, scale: 0.82 },
    { side: 'R', row: 0, x: 705, y: 1520, scale: 0.82 },
    { side: 'L', row: 1, x: 345, y: 1640, scale: 0.90 },
    { side: 'R', row: 1, x: 735, y: 1640, scale: 0.90 },
    { side: 'L', row: 2, x: 315, y: 1755, scale: 0.98 },
    { side: 'R', row: 2, x: 765, y: 1755, scale: 0.98 }
  ];

  let lastRenderedLeaderboardJson = '';

  function renderCongregationHall(leaderboard = []) {
    if (!congregationHall) return;
    const hallViewers = leaderboard.slice(6, 12);
    const sig = JSON.stringify(hallViewers.map((d) => `${d.name}:${d.merit}`));
    if (sig === lastRenderedLeaderboardJson && congregationHall.children.length > 0) return;
    lastRenderedLeaderboardJson = sig;

    congregationHall.innerHTML = HALL_SEAT_COORDS.map((seat, idx) => {
      const viewer = hallViewers[idx];
      if (!viewer) return '';
      const badgeHtml = `
        <div class="seat-badge">
          <span class="seat-avatar">${
            viewer.avatar
              ? `<img src="${escapeHtml(viewer.avatar)}" alt="" />`
              : escapeHtml(String(viewer.name || 'ศ').charAt(0).toUpperCase())
          }</span>
          <span class="seat-username">${escapeHtml(shortenName(viewer.name, 11))}</span>
        </div>
      `;

      return `
        <div
          class="hall-seat"
          data-seat-idx="${idx}"
          style="left: ${seat.x}px; top: ${seat.y}px; z-index: ${20 + seat.row * 2}; transform: translate(-50%, -100%) scale(${seat.scale});"
        >
          <img
            src="/assets/devotee.png"
            alt="ผู้ศรัทธา"
            class="devotee-sprite"
            style="animation-delay: ${((idx * 0.27) % 3.5).toFixed(2)}s;"
          />
          ${badgeHtml}
        </div>
      `;
    }).join('');
  }

  // Preload 8 frame ตัวละครผู้ศรัทธาและภาพองค์เห้งเจียทั้ง 4 ระดับ
  const SPRITE_FRAMES = {
    walk1: '/assets/devotee_walk.png',
    walk2: '/assets/devotee_walk_2.png',
    kneelDown: '/assets/devotee_kneel_down.png',
    kneel: '/assets/devotee.png',
    forehead: '/assets/devotee_bow.png',
    bowMid: '/assets/devotee_bow_mid.png',
    prostrate: '/assets/devotee_prostrate.png',
    prostrateDeep: '/assets/devotee_prostrate_deep.png'
  };
  [
    ...Object.values(SPRITE_FRAMES),
    '/assets/wukong/LV1.jpg',
    '/assets/wukong/LV2.jpg',
    '/assets/wukong/LV3.jpg',
    '/assets/wukong/LV4.jpg'
  ].forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  function pulseHallBowing() {
    if (!congregationHall) return;
    const seats = congregationHall.querySelectorAll('.hall-seat');
    seats.forEach((el, i) => {
      const img = el.querySelector('.devotee-sprite');
      if (!img) return;
      const delay = (i % 4) * 80;
      setTimeout(() => { img.src = SPRITE_FRAMES.forehead; }, delay);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 140);
      setTimeout(() => { img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 300);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 620);
      setTimeout(() => { img.src = SPRITE_FRAMES.kneel; }, delay + 780);
    });
  }

  let prostrationTimers = [];
  function clearProstrationTimers() {
    while (prostrationTimers.length > 0) {
      clearTimeout(prostrationTimers.pop());
    }
  }

  function setCentralPose(poseKey) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    const frames = stack.querySelectorAll('.pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  function schedulePose(ms, poseKey) {
    prostrationTimers.push(
      setTimeout(() => {
        setCentralPose(poseKey);
      }, ms)
    );
  }

  function playThreeBowsSequence(startDelayMs = 0) {
    schedulePose(startDelayMs, 'kneelDown');
    schedulePose(startDelayMs + 160, 'kneel');

    const bowOffsets = [startDelayMs + 320, startDelayMs + 1820, startDelayMs + 3320];
    bowOffsets.forEach((t0) => {
      schedulePose(t0, 'forehead');
      schedulePose(t0 + 170, 'bowMid');
      schedulePose(t0 + 330, 'prostrate');
      schedulePose(t0 + 490, 'prostrateDeep');
      schedulePose(t0 + 860, 'prostrate');
      schedulePose(t0 + 1020, 'bowMid');
      schedulePose(t0 + 1180, 'kneel');
    });

    schedulePose(startDelayMs + 4800, 'forehead');
    schedulePose(startDelayMs + 5350, 'kneel');
  }

  function animateWalkerOnCarpet(user, avatar, actionLabel, wish) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;

    clearProstrationTimers();
    updateCentralWorshipper(user, avatar, actionLabel, wish, false);

    centralEl.classList.remove('walking-up');
    void centralEl.offsetWidth;
    centralEl.classList.add('walking-up');

    setCentralPose('walk1');
    for (let step = 1; step <= 10; step++) {
      schedulePose(step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
    }

    prostrationTimers.push(
      setTimeout(() => {
        centralEl.classList.remove('walking-up');
      }, 2100)
    );
    playThreeBowsSequence(2050);
  }

  function updateCentralWorshipper(user, avatar, actionLabel, wish, doThreeBows = true) {
    const nameEl = document.getElementById('centralName');
    const actEl = document.getElementById('centralAction');
    const wishEl = document.getElementById('centralWishBubble');
    const avatarEl = document.getElementById('centralAvatar');
    const beam = document.getElementById('sacredLightBeam');

    if (nameEl) nameEl.textContent = user || 'ผู้ศรัทธา';
    if (actEl) actEl.textContent = actionLabel || '✨ จุดธูปขอพรองค์เห้งเจีย';
    if (wishEl) wishEl.textContent = `“${wish || 'ขอองค์เจ้าพ่อเห้งเจียประทานโชคลาภและสิริมงคล'}”`;

    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
      } else {
        avatarEl.textContent = String(user || '🙏').trim().charAt(0).toUpperCase();
      }
    }

    if (doThreeBows) {
      clearProstrationTimers();
      const centralEl = document.getElementById('centralWorshipper');
      if (centralEl) centralEl.classList.remove('walking-up');
      playThreeBowsSequence(0);
    }
    if (beam) {
      beam.classList.add('intense');
      setTimeout(() => beam.classList.remove('intense'), 4500);
    }

    const haloSys = document.getElementById('buddhaHaloSystem');
    const lotusHand = document.getElementById('lotusHandHalo');
    if (haloSys) {
      haloSys.classList.add('flare');
      setTimeout(() => haloSys.classList.remove('flare'), 3600);
    }
    if (lotusHand) {
      lotusHand.classList.add('flare');
      setTimeout(() => lotusHand.classList.remove('flare'), 3600);
    }
    particles.spawnBellWave(540, 490, 2);

    const hudName = document.getElementById('devoteeNameLine');
    const hudAct = document.getElementById('devoteeActionTag');
    if (hudName) hudName.textContent = user || 'สายบุญ';
    if (hudAct) hudAct.textContent = actionLabel || 'กราบสักการะเจ้าพ่อเห้งเจีย';
  }

  // 6. ระบบสลับระดับภาพองค์เจ้าพ่อเห้งเจีย 4 ระดับ (LV.1 -> LV.2 -> LV.3 -> LV.4)
  let currentDisplayedLevel = 1;
  let evoBannerTimer = null;

  function applyEvolutionStage(evo, triggerFlash = false) {
    if (!evo) return;
    const lvl = Math.max(1, Math.min(4, Number(evo.level) || 1));
    const levelChanged = lvl !== currentDisplayedLevel;
    currentDisplayedLevel = lvl;

    if (stage9x16) {
      stage9x16.setAttribute('data-evo-level', String(lvl));
    }

    document.querySelectorAll('.evo-stage-img').forEach((img) => {
      const imgLvl = Number(img.getAttribute('data-level'));
      img.classList.toggle('active', imgLvl === lvl);
    });

    if (triggerFlash || levelChanged) {
      const flash = document.getElementById('evolutionFlashOverlay');
      if (flash) {
        flash.classList.add('flash');
        setTimeout(() => flash.classList.remove('flash'), 650);
      }
    }

    const stageLabel = document.getElementById('currentDeityStageLabel');
    if (stageLabel) {
      stageLabel.textContent = `LV.${lvl} ${evo.shortName || evo.name} (${evo.chineseTitle || '孙悟空'}) • โบนัสบุญ ×${evo.meritMultiplier || 1}`;
    }

    const evoFill = document.getElementById('evoProgressFill');
    const evoLabel = document.getElementById('evoProgressLabel');
    if (evoFill) {
      evoFill.style.width = `${Math.max(4, Math.min(100, Number(evo.progressPct) || 0))}%`;
    }
    if (evoLabel) {
      if (evo.isMaxLevel) {
        evoLabel.textContent = `👑 บรรลุระดับสูงสุด LV.4 โต้วจั้นเซิ่งฝอ (${Number(evo.exp || 0).toLocaleString('th-TH')} EXP • แต้มบุญ ×2.0)`;
      } else {
        evoLabel.textContent = `⚡ พลังบารมีอัพระดับ: ${Number(evo.exp || 0).toLocaleString('th-TH')} / ${Number(evo.nextExp || 1000).toLocaleString('th-TH')} EXP (อีก ${Number(evo.expToNext || 0).toLocaleString('th-TH')} EXP สู่ LV.${lvl + 1})`;
      }
    }

    document.querySelectorAll('.evo-pill').forEach((pill) => {
      const t = Number(pill.getAttribute('data-target-level'));
      pill.classList.toggle('active', t === lvl);
    });

    [1, 2, 3, 4].forEach((n) => {
      const btn = document.getElementById(`btnEvoLv${n}`);
      if (btn) btn.classList.toggle('active-toggle', n === lvl);
    });
  }

  function showEvolutionLevelUpBanner(evoUp) {
    if (!evoUp) return;
    audio.playEvolutionFanfare();
    particles.spawnEvolutionBurst(evoUp.toLevel || 2);
    pulseHallBowing();

    const banner = document.getElementById('evolutionBanner');
    const titleEl = document.getElementById('evoBannerTitle');
    const subEl = document.getElementById('evoBannerSub');
    if (titleEl) titleEl.textContent = `🐒 ${evoUp.name} 🐒`;
    if (subEl) subEl.textContent = `${evoUp.subtitle} (${evoUp.chineseTitle || ''})`;
    if (banner) {
      banner.classList.add('visible');
      clearTimeout(evoBannerTimer);
      evoBannerTimer = setTimeout(() => {
        banner.classList.remove('visible');
      }, 6500);
    }
  }

  // 7. อัปเดตสถานะ UI ทั้งหมดจาก Server State
  let hasInitializedRealLeader = false;

  function updateUIState(st) {
    if (!st) return;

    const incEl = document.getElementById('statIncense');
    const merEl = document.getElementById('statMerit');
    const wfEl = document.getElementById('statWoodenFish');
    if (incEl) incEl.textContent = Number(st.totalIncense || 0).toLocaleString('th-TH');
    if (merEl) merEl.textContent = Number(st.totalMerit || 0).toLocaleString('th-TH');
    if (wfEl) wfEl.textContent = Number(st.woodenFishHits || 0).toLocaleString('th-TH');

    // อัปเดตหลอดศรัทธาวันนี้
    const faithToday = Number(st.faithToday ?? 477);
    const faithTarget = Math.max(1, Number(st.faithTarget ?? 1000));
    const faithPct = Math.min(100, Math.round((faithToday / faithTarget) * 100));
    const faithFill = document.getElementById('faithProgressFill');
    const statFaithToday = document.getElementById('statFaithToday');
    const statFaithTarget = document.getElementById('statFaithTarget');
    if (faithFill) faithFill.style.width = `${Math.max(5, faithPct)}%`;
    if (statFaithToday) statFaithToday.textContent = faithToday.toLocaleString('th-TH');
    if (statFaithTarget) statFaithTarget.textContent = faithTarget.toLocaleString('th-TH');

    if (st.evolution) {
      applyEvolutionStage(st.evolution, false);
    }

    renderIncenseSticks(st.activeIncenseSticks || 9);

    const lb = Array.isArray(st.leaderboard) ? st.leaderboard : [];
    renderVipCushions(lb);
    renderCongregationHall(lb);

    if (!hasInitializedRealLeader && lb.length > 0) {
      hasInitializedRealLeader = true;
      const topDev = lb[0];
      updateCentralWorshipper(
        topDev.name,
        topDev.avatar,
        `✨ สายบุญอันดับ 1 • ${Number(topDev.merit).toLocaleString('th-TH')} แต้มบุญ`,
        topDev.lastWish || 'ขอองค์เจ้าพ่อเห้งเจียประทานพรให้ร่ำรวยโชคลาภ',
        false
      );
    }

    // อัปเดตกระดาน "สายบุญตัวจริง" ในกรอบซ้าย (ตามแบบ Ref Interactive UI)
    const lbList = document.getElementById('leaderboardList');
    if (lbList) {
      const medals = ['🥇', '🥈', '🥉', '4'];
      lbList.innerHTML = lb
        .slice(0, 4)
        .map(
          (item, idx) => `
          <div class="shrine-lb-row leader-item">
            <div class="shrine-lb-medal leader-rank">
              ${
                item.avatar
                  ? `<img src="${escapeHtml(item.avatar)}" alt="" />`
                  : medals[idx] || item.rank
              }
            </div>
            <div class="shrine-lb-info">
              <div class="shrine-lb-name leader-name">${escapeHtml(shortenName(item.name, 14))}</div>
              <div class="shrine-lb-score leader-merit">${Number(item.merit).toLocaleString('th-TH')} แต้มบุญ</div>
            </div>
          </div>
        `
        )
        .join('');
    }

    // สถานะเชื่อมต่อห้อง TikTok Live
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveStatusText');
    if (st.tiktok?.connected) {
      liveDot?.classList.add('connected');
      if (liveText) liveText.textContent = `LIVE @${st.tiktok.username} • ผู้ชม ${st.tiktok.viewerCount || 0} คน`;
    } else if (st.tiktok?.connecting) {
      liveDot?.classList.remove('connected');
      if (liveText) liveText.textContent = `กำลังเชื่อมต่อ @${st.tiktok.username}...`;
    } else {
      liveDot?.classList.remove('connected');
      if (liveText) {
        liveText.textContent = st.settings?.autoSim
          ? 'โหมดจำลองผู้ชมและของขวัญอัตโนมัติ'
          : 'ศาลเจ้าพ่อเห้งเจีย • พร้อมรับคำอธิษฐาน';
      }
    }

    const btnAutoSim = document.getElementById('btnToggleAutoSim');
    if (btnAutoSim && st.settings) {
      btnAutoSim.textContent = st.settings.autoSim
        ? '🤖 จำลองผู้ชมส่งของขวัญอัตโนมัติ: เปิดอยู่'
        : '🤖 จำลองผู้ชมส่งของขวัญอัตโนมัติ: ปิด';
      btnAutoSim.classList.toggle('active-toggle', Boolean(st.settings.autoSim));
    }

    if (st.settings) {
      if (st.settings.ttsVoice) {
        audio.setTtsVoice(st.settings.ttsVoice);
        const selVoice = document.getElementById('selectTtsVoice');
        if (selVoice) selVoice.value = st.settings.ttsVoice;
      }
      if (typeof st.settings.musicVolume === 'number') {
        audio.setMusicVolume(st.settings.musicVolume);
        const sMus = document.getElementById('sliderMusicVol');
        const vMus = document.getElementById('valMusicVol');
        const pct = Math.round(st.settings.musicVolume * 100);
        if (sMus) sMus.value = String(pct);
        if (vMus) vMus.textContent = `${pct}%`;
      }
      if (typeof st.settings.ttsVolume === 'number') {
        audio.setTtsVolume(st.settings.ttsVolume);
        const sTts = document.getElementById('sliderTtsVol');
        const vTts = document.getElementById('valTtsVol');
        const pct = Math.round(st.settings.ttsVolume * 100);
        if (sTts) sTts.value = String(pct);
        if (vTts) vTts.textContent = `${pct}%`;
      }
    }

    const feed = document.getElementById('eventFeed');
    if (feed && Array.isArray(st.recentEvents)) {
      feed.innerHTML = st.recentEvents
        .slice(0, 8)
        .map((ev) => `<div class="event-feed-item">${formatEventSummary(ev)}</div>`)
        .join('');
    }
  }

  function formatEventSummary(ev) {
    switch (ev.type) {
      case 'burnIncense':
        return `🔥 <strong>${escapeHtml(ev.user)}</strong> จุดธูปไหว้ ${ev.count} ดอก (+${ev.merit} แต้มบุญ • +${ev.expGain || 9} EXP)`;
      case 'strikeWoodenFish':
        return `🪵 <strong>${escapeHtml(ev.user)}</strong> กดหัวใจ/เคาะปักฮื้อ (+${ev.merit} แต้มบุญ)`;
      case 'ringBell':
        return `🔔 <strong>${escapeHtml(ev.user)}</strong> ตีระฆังทองคำ (+${ev.merit} แต้มบุญ)`;
      case 'sendPrayer':
        return `🏮 <strong>${escapeHtml(ev.user)}</strong> อธิษฐาน: “${escapeHtml(ev.wish)}”`;
      case 'offerGift':
      case 'grandCeremony':
        return `🎁 <strong>${escapeHtml(ev.user)}</strong> ส่ง <em>${escapeHtml(ev.giftName)}</em> (+${ev.expGain || 0} EXP • +${ev.merit} แต้มบุญ)`;
      case 'drawFortune':
        return `🎋 <strong>${escapeHtml(ev.user)}</strong> ได้เซียมซีใบที่ ${ev.fortune?.number} (${ev.fortune?.rank})`;
      case 'evolutionChange':
        return `⚡ <strong>องค์เจ้าพ่อเห้งเจีย</strong> อัพระดับสู่ <em>${escapeHtml(ev.evolutionUp?.name || '')}</em>`;
      default:
        return `✨ <strong>${escapeHtml(ev.user || 'สายบุญ')}</strong> ร่วมสักการะ`;
    }
  }

  // 8. การแสดงผลพิธีกรรม เซียมซี และเอฟเฟกต์ของขวัญ
  function playFortuneSequence(ev) {
    audio.playFortuneShake();
    updateCentralWorshipper(
      ev.user,
      ev.avatar,
      '🎋 กำลังเขย่ากระบอกเซียมซี...',
      `คุณ ${ev.user} กำลังตั้งจิตอธิษฐานเสี่ยงเซียมซีเจ้าพ่อเห้งเจีย...`,
      false
    );
    audio.enqueueTts(ev.ttsText || '', {
      voice: ev.ttsVoice || audio.ttsVoice || 'thai_female',
      onStart: () => {
        audio.playIncenseChime();
        showFortuneModal(ev.user, ev.fortune);
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `🎋 เซียมซีใบที่ ${ev.fortune?.number} (${ev.fortune?.rank})`,
          ev.fortune?.meaning || '',
          true
        );
      },
      onEnd: () => {
        clearTimeout(fortuneTimer);
        fortuneTimer = setTimeout(() => {
          document.getElementById('fortuneModal')?.classList.remove('visible');
        }, 2200);
      }
    });
  }

  let fortuneTimer = null;
  let grandTimer = null;

  function triggerRitualVisuals(ev) {
    if (!ev) return;

    if (ev.evolutionUp) {
      showEvolutionLevelUpBanner(ev.evolutionUp);
    }

    if (ev.type === 'evolutionChange') {
      if (ev.ttsText) {
        audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || audio.ttsVoice || 'thai_female' });
      }
      return;
    }

    const giftActionResult = window.TempleGiftActionEngine?.handle(ev) || {
      allowWalker: ['burnIncense', 'sendPrayer', 'offerGift', 'grandCeremony', 'ringBell', 'drawFortune'].includes(ev.type),
      interruptsRitual: false
    };

    if (!giftActionResult.coalescedCombo) {
      window.dispatchEvent(new CustomEvent('temple:ritual', { detail: ev }));
    }

    if (ev.ttsText && ev.type !== 'drawFortune' && !giftActionResult.coalescedCombo) {
      audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || audio.ttsVoice || 'thai_female' });
    }

    switch (ev.type) {
      case 'burnIncense': {
        audio.playIncenseChime();
        particles.spawnIncenseBurst(540, 1065);
        particles.spawnFloatingMerit(`+${ev.merit} แต้มบุญ`, 540, 1020, '#ffe082');
        if (giftActionResult.allowWalker) {
          animateWalkerOnCarpet(ev.user, ev.avatar, `🔥 จุดธูปไหว้ ${ev.count} ดอก (+${ev.merit} แต้มบุญ)`, ev.wish);
        }
        break;
      }

      case 'strikeWoodenFish': {
        audio.playWoodenFish();
        pulseHallBowing();
        particles.spawnIncenseBurst(540, 1065);
        particles.spawnFloatingMerit(`+${ev.merit} แต้มบุญ`, 540, 1030, '#ffd54f');
        break;
      }

      case 'ringBell': {
        audio.playTempleBell(1.0);
        pulseHallBowing();
        particles.spawnBellWave(540, 490, 4);
        particles.spawnFloatingMerit(`+${ev.merit} แต้มบุญ`, 540, 1000, '#fff3b0');
        if (giftActionResult.allowWalker) {
          updateCentralWorshipper(ev.user, ev.avatar, `🔔 ตีระฆังทองคำ (+${ev.merit} แต้มบุญ)`, ev.wish);
        }
        break;
      }

      case 'sendPrayer': {
        audio.playIncenseChime();
        spawnSkyLantern(ev.user, ev.wish);
        particles.spawnFloatingMerit(`+${ev.merit} แต้มบุญ`, 540, 1010, '#ffb74d');
        if (giftActionResult.allowWalker) {
          animateWalkerOnCarpet(ev.user, ev.avatar, `🏮 ปล่อยโคมขอพร (+${ev.merit} แต้มบุญ)`, ev.wish);
        }
        break;
      }

      case 'offerGift': {
        if (!giftActionResult.coalescedCombo) {
          if (!giftActionResult.action) {
            audio.playIncenseChime();
            audio.playTempleBell(0.85);
          }
          particles.spawnIncenseBurst(540, 1065);
        }
        particles.spawnFloatingMerit(`+${ev.expGain || 15} EXP • +${ev.merit} บุญ`, 540, 980, '#fff3b0');
        if (giftActionResult.allowWalker) {
          animateWalkerOnCarpet(ev.user, ev.avatar, `🎁 ถวาย ${ev.giftName} (+${ev.expGain || 15} EXP)`, ev.wish);
        }
        break;
      }

      case 'grandCeremony': {
        if (!giftActionResult.coalescedCombo) {
          if (!giftActionResult.action) {
            audio.playTempleBell(1.2);
            setTimeout(() => audio.playTempleBell(1.1), 900);
          }
          particles.spawnGrandCeremonyRain();
          pulseHallBowing();
          showGrandCeremonyBanner(ev.user, ev.giftName, ev.merit, ev.expGain);
        }
        particles.spawnFloatingMerit(`+${ev.expGain || 5000} EXP!`, 540, 940, '#ffeb3b');
        if (giftActionResult.allowWalker) {
          animateWalkerOnCarpet(ev.user, ev.avatar, `🐉 ${ev.giftName} (+${ev.expGain || 5000} EXP)`, ev.wish);
        }
        break;
      }

      case 'drawFortune': {
        if (giftActionResult.allowWalker) playFortuneSequence(ev);
        break;
      }
    }
  }

  window.addEventListener('temple:character-interrupted', () => {
    clearProstrationTimers();
    const centralEl = document.getElementById('centralWorshipper');
    centralEl?.classList.remove('walking-up');
    setCentralPose('kneel');
  });

  window.addEventListener('temple:character-start', (event) => {
    const ev = event.detail;
    if (!ev) return;
    if (ev.type === 'ringBell') {
      updateCentralWorshipper(ev.user, ev.avatar, `🔔 ตีระฆังทองคำ (+${ev.merit} แต้มบุญ)`, ev.wish);
      return;
    }
    if (ev.type === 'drawFortune') {
      playFortuneSequence(ev);
      return;
    }
    const labels = {
      burnIncense: `🔥 จุดธูปไหว้ ${ev.count} ดอก (+${ev.merit} แต้มบุญ)`,
      sendPrayer: `🏮 ปล่อยโคมขอพร (+${ev.merit} แต้มบุญ)`,
      offerGift: `🎁 ถวาย ${ev.giftName} (+${ev.expGain || 15} EXP)`,
      grandCeremony: `🐉 ${ev.giftName} (+${ev.expGain || 5000} EXP)`
    };
    animateWalkerOnCarpet(ev.user, ev.avatar, labels[ev.type] || '✨ ร่วมพิธีสักการะ', ev.wish);
  });

  function spawnSkyLantern(user, wish) {
    const layer = document.getElementById('skyLanternsLayer');
    if (!layer) return;
    const lantern = document.createElement('div');
    lantern.className = 'sky-lantern';
    const leftPos = 290 + Math.floor(Math.random() * 260);
    lantern.style.left = `${leftPos}px`;
    lantern.innerHTML = `
      <div class="sky-lantern-user">🙏 ${escapeHtml(user)}</div>
      <div class="sky-lantern-wish">“${escapeHtml(wish)}”</div>
    `;
    layer.appendChild(lantern);
    setTimeout(() => {
      lantern.remove();
    }, 10600);
  }

  function showFortuneModal(user, fortune) {
    if (!fortune) return;
    const modal = document.getElementById('fortuneModal');
    document.getElementById('fortuneRankBadge').textContent = fortune.rank;
    document.getElementById('fortuneTitle').textContent = `เซียมซีใบที่ ${fortune.number} — ${fortune.title}`;
    document.getElementById('fortuneDevotee').textContent = `ผู้เสี่ยงเซียมซี: คุณ ${user}`;
    document.getElementById('fortunePoem').textContent = fortune.poem;
    document.getElementById('fortuneMeaning').textContent = `คำทำนาย: ${fortune.meaning}`;

    modal.classList.add('visible');
    clearTimeout(fortuneTimer);
    fortuneTimer = setTimeout(() => {
      modal.classList.remove('visible');
    }, 15000);
  }

  document.getElementById('fortuneModal')?.addEventListener('click', () => {
    document.getElementById('fortuneModal').classList.remove('visible');
  });

  function showGrandCeremonyBanner(user, giftName, merit, expGain) {
    const banner = document.getElementById('grandCeremonyBanner');
    document.getElementById('grandTitle').textContent = `🐉 ${giftName} 🐉`;
    document.getElementById('grandSub').textContent = `สายบุญใหญ่ คุณ ${user} • พลังบารมี +${Number(expGain || 0).toLocaleString('th-TH')} EXP (+${Number(merit || 0).toLocaleString('th-TH')} แต้มบุญ)`;
    banner.classList.add('visible');
    clearTimeout(grandTimer);
    grandTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 6800);
  }

  // 9. เชื่อมต่อ WebSocket JSON-RPC 2.0
  let ws = null;
  let rpcId = 1;
  let lastTikTokConnected = null;

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'temple.state') {
          const connected = msg.params?.tiktok?.connected;
          if (typeof connected === 'boolean' && connected !== lastTikTokConnected) {
            window.TempleGiftActionEngine?.resetStreaks?.();
            lastTikTokConnected = connected;
          }
          updateUIState(msg.params);
        } else if (msg.method === 'temple.gift-streak-end') {
          window.TempleGiftActionEngine?.clearStreak?.(msg.params?.groupId);
        } else if (msg.method === 'temple.event') {
          if (msg.params?.state) updateUIState(msg.params.state);
          if (msg.params?.event) triggerRitualVisuals(msg.params.event);
        } else if (msg.method === 'tts.play') {
          if (msg.params?.url) {
            audio.enqueueTts(msg.params.text || 'สาธุ', {
              voice: msg.params.voice || 'thai_female',
              url: msg.params.url
            });
          }
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  }
  connectWebSocket();

  async function callRpc(method, params = {}) {
    audio.ensureContext();
    const payload = {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data?.result?.state) updateUIState(data.result.state);
    if (data?.result?.event) triggerRitualVisuals(data.result.event);
    return data;
  }

  function getFormInput() {
    const user = document.getElementById('inputDevoteeName')?.value.trim() || 'คุณเบิร์ด สายบุญ';
    const wish =
      document.getElementById('inputDevoteeWish')?.value.trim() ||
      'ขอองค์เจ้าพ่อเห้งเจียประทานโชคลาภ ค้าขายร่ำรวย สมปรารถนาทุกประการ';
    return { user, wish };
  }

  // ปุ่มเปลี่ยนระดับ Evolution 4 ปาง (ทั้งบนหน้าจอ 9:16 และในแผงควบคุมด้านข้าง)
  document.querySelectorAll('[data-target-level], [data-set-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const level = Number(btn.getAttribute('data-target-level') || btn.getAttribute('data-set-level') || 1);
      const { user } = getFormInput();
      callRpc('temple.setEvolutionLevel', { level, user });
    });
  });

  // กรอบซ้าย: พิมพ์ในแชท (คลิกเพื่อจำลองได้ทันที)
  document.getElementById('cardChatWalk')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardChatFortune')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  document.getElementById('cardChatLike')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 9 });
  });

  // กรอบขวา: ส่งของขวัญ 6 รายการ (ครอบคลุม 4 ระดับการ Donate อัพระดับองค์เทพ)
  document.getElementById('giftItemLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 1,
      giftName: 'ดอกบัวถวายองค์เทพ',
      wish
    });
  });

  document.getElementById('giftItemCandle')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lamp',
      coins: 5,
      giftName: 'รูปเทียนจุดบูชา',
      wish
    });
  });

  document.getElementById('giftItemFortune')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lamp',
      coins: 20,
      giftName: 'เซียมซีส่วนตัว',
      wish
    });
    setTimeout(() => {
      callRpc('temple.drawFortune', { user, topic: wish });
    }, 900);
  });

  document.getElementById('giftItemGoldBar')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'fruit',
      coins: 30,
      giftName: 'ทองคำแท่งและลูกท้อสวรรค์',
      wish
    });
  });

  document.getElementById('giftItemGrandMerit')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'dragon',
      coins: 100,
      giftName: 'ร่วมบุญใหญ่ กระบองทองค้ำฟ้า',
      wish
    });
  });

  document.getElementById('giftItemMegaDragon')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.grandCeremony', {
      user,
      coins: 500,
      giftName: 'มหาบุญมังกรทอง ฉลองทั้งไลฟ์',
      wish
    });
  });

  // จุดคลิกบนแท่นพิธีและแถบล่าง
  document.getElementById('incenseBurnerZone')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardBlessing')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  document.getElementById('cardLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 10,
      giftName: 'ดอกบัวทองคำ',
      wish
    });
  });

  document.getElementById('cardFortuneBtn')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  document.getElementById('woodenFishStation')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 3 });
  });

  document.getElementById('bellStation')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('fortuneCylinder')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  // ปุ่มใน Quick Dock ด้านขวา
  document.getElementById('btnRpcIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('btnRpcFortune')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  document.getElementById('btnRpcGiftLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 1,
      giftName: 'ดอกบัวถวายองค์เทพ',
      wish
    });
  });

  document.getElementById('btnRpcGiftCandle')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lamp',
      coins: 5,
      giftName: 'รูปเทียนจุดบูชา',
      wish
    });
  });

  document.getElementById('btnRpcGiftGold')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'fruit',
      coins: 30,
      giftName: 'ทองคำแท่งและลูกท้อสวรรค์',
      wish
    });
  });

  document.getElementById('btnRpcGiftRocket')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'dragon',
      coins: 100,
      giftName: 'ร่วมบุญใหญ่ กระบองทองค้ำฟ้า',
      wish
    });
  });

  document.getElementById('btnRpcGrandCeremony')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.grandCeremony', {
      user,
      coins: 500,
      giftName: 'มหาบุญมังกรทอง ฉลองทั้งไลฟ์',
      wish
    });
  });

  document.getElementById('btnResetMerit')?.addEventListener('click', () => {
    callRpc('temple.resetMerit', {});
  });

  document.getElementById('selectTtsVoice')?.addEventListener('change', (e) => {
    const voice = e.target.value;
    audio.setTtsVoice(voice);
    callRpc('temple.updateSettings', { ttsVoice: voice });
  });

  document.getElementById('btnConnectTikTok')?.addEventListener('click', () => {
    const username = document.getElementById('inputTikTokUser')?.value.trim();
    if (!username) return;
    callRpc('live.connect', { username });
  });

  let autoSimState = false;
  document.getElementById('btnToggleAutoSim')?.addEventListener('click', () => {
    autoSimState = !autoSimState;
    callRpc('live.setAutoSim', { enabled: autoSimState });
  });

  document.getElementById('btnToggleTts')?.addEventListener('click', (e) => {
    audio.ttsEnabled = !audio.ttsEnabled;
    const btn = e.currentTarget;
    btn.textContent = `🎙️ เสียงพูดไทย: ${audio.ttsEnabled ? 'เปิด' : 'ปิด'}`;
    btn.classList.toggle('active-toggle', audio.ttsEnabled);
  });

  document.getElementById('btnToggleSfx')?.addEventListener('click', (e) => {
    audio.setSfxEnabled(!audio.sfxEnabled);
    const btn = e.currentTarget;
    btn.textContent = `✨ เอฟเฟกต์เสียง: ${audio.sfxEnabled ? 'เปิด' : 'ปิด'}`;
    btn.classList.toggle('active-toggle', audio.sfxEnabled);
  });

  document.getElementById('btnToggleMusic')?.addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    const btn = e.currentTarget;
    btn.textContent = `🎵 เพลงบรรเลง: ${audio.bgMusicEnabled ? 'เปิด' : 'ปิด'}`;
    btn.classList.toggle('active-toggle', audio.bgMusicEnabled);
  });

  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol && valMusicVol) {
    const initMusPct = Math.round(audio.bgBaseVolume * 100);
    sliderMusicVol.value = String(initMusPct);
    valMusicVol.textContent = `${initMusPct}%`;
    sliderMusicVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valMusicVol.textContent = `${pct}%`;
      audio.ensureContext();
      audio.setMusicVolume(pct / 100);
    });
    sliderMusicVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { musicVolume: +(pct / 100).toFixed(2) });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol && valTtsVol) {
    const initTtsPct = Math.round(audio.ttsVolume * 100);
    sliderTtsVol.value = String(initTtsPct);
    valTtsVol.textContent = `${initTtsPct}%`;
    sliderTtsVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valTtsVol.textContent = `${pct}%`;
      audio.setTtsVolume(pct / 100);
    });
    sliderTtsVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { ttsVolume: +(pct / 100).toFixed(2) });
    });
  }

  const btnToggleSfx = document.getElementById('btnToggleSfx');
  if (btnToggleSfx) {
    btnToggleSfx.textContent = `✨ เอฟเฟกต์เสียง: ${audio.sfxEnabled ? 'เปิด' : 'ปิด'}`;
    btnToggleSfx.classList.toggle('active-toggle', audio.sfxEnabled);
  }

  const sliderSfxVol = document.getElementById('sliderSfxVol');
  const valSfxVol = document.getElementById('valSfxVol');
  if (sliderSfxVol && valSfxVol) {
    const initialSfxPct = Math.round(audio.sfxVolume * 100);
    sliderSfxVol.value = String(initialSfxPct);
    valSfxVol.textContent = `${initialSfxPct}%`;
    sliderSfxVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valSfxVol.textContent = `${pct}%`;
      audio.setSfxVolume(pct / 100);
    });
  }

  function shortenName(name, maxLen = 13) {
    const str = String(name || '');
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
