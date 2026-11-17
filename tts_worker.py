#!/usr/bin/env python3
"""
Persistent Thai TTS Worker Daemon for Sun Wukong TikTok Live Sanctuary.
Supports:
- 'thai_female' : Google Thai Female TTS (gTTS lang='th') with automatic fallback to local VITS ONNX
- 'thai_vits'   : Local Neural VITS ONNX Thai Model (csukuangfj/vits-mms-tha via sherpa-onnx)
Features:
- Strict Thai/Latin text sanitizer: strips Cuneiform (𒐫), Zalgo, emojis, and spam tokens
- Automatic transliteration of Chinese Sun Wukong titles and Arabic numbers into spoken Thai words
- Waveform polishing for WAV outputs (DC offset removal, soft peak normalization <= 0.88, cosine fade-in/out)
- Low CPU configuration: intra_op_num_threads=3 + OMP_WAIT_POLICY=PASSIVE (0% CPU when idle)
"""
import hashlib
import json
import os
import re
import sys
import time
import traceback
import unicodedata
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "3")
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")
os.environ.setdefault("MKL_NUM_THREADS", "3")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "3")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "3")

for stream in (sys.stdin, sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

import numpy as np
import soundfile as sf

try:
    import sherpa_onnx
except ImportError:
    sherpa_onnx = None

try:
    from gtts import gTTS
except ImportError:
    gTTS = None

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "data" / "tts-cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

VITS_MODEL_DIR = BASE_DIR / "models" / "vits-mms-tha"

# Transliterate Chinese deity titles and abbreviations into natural spoken Thai
CHINESE_TO_THAI_MAP = {
    "孙悟空": "ซุนหงอคง",
    "孫悟空": "ซุนหงอคง",
    "美猴王": "มุ้ยเกาอ๋อง",
    "水簾洞": "ถ้ำม่านน้ำตก",
    "水帘洞": "ถ้ำม่านน้ำตก",
    "齐天大圣": "ฉีเทียนต้าเซิ่ง",
    "齊天大聖": "ฉีเทียนต้าเซิ่ง",
    "斗战胜佛": "โต้วจั้นเซิ่งฝอ",
    "鬥戰勝佛": "โต้วจั้นเซิ่งฝอ",
    "大圣佛祖": "ต้าเซิ่งฝอจู่",
    "如意金箍棒": "กระบองทองค้ำฟ้า",
    "LV.1": "ระดับที่หนึ่ง",
    "LV.2": "ระดับที่สอง",
    "LV.3": "ระดับที่สาม",
    "LV.4": "ระดับที่สี่",
    "LV1": "ระดับที่หนึ่ง",
    "LV2": "ระดับที่สอง",
    "LV3": "ระดับที่สาม",
    "LV4": "ระดับที่สี่",
    "EXP": "แต้มบารมี",
}

THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
THAI_PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]


def int_to_thai_words(n: int) -> str:
    if n == 0:
        return "ศูนย์"
    if n < 0:
        return "ลบ" + int_to_thai_words(-n)
    if n >= 1000000:
        millions = n // 1000000
        rem = n % 1000000
        return int_to_thai_words(millions) + "ล้าน" + (int_to_thai_words(rem) if rem else "")
    s = str(n)
    length = len(s)
    parts = []
    for i, ch in enumerate(s):
        d = int(ch)
        pos = length - i - 1
        if d == 0:
            continue
        if pos == 1 and d == 1:
            parts.append("สิบ")
        elif pos == 1 and d == 2:
            parts.append("ยี่สิบ")
        elif pos == 0 and d == 1 and length > 1:
            parts.append("เอ็ด")
        else:
            parts.append(THAI_DIGITS[d] + THAI_PLACES[pos])
    return "".join(parts)


def replace_numbers_with_thai_words(text: str) -> str:
    # Remove commas inside numbers first (e.g. 1,000 -> 1000)
    text = re.sub(r"(\d),(\d)", r"\1\2", text)
    text = re.sub(r"(\d),(\d)", r"\1\2", text)

    def _repl(match):
        try:
            val = int(match.group(0))
            if val <= 9999999:
                return f" {int_to_thai_words(val)} "
        except Exception:
            pass
        return match.group(0)

    return re.sub(r"\d+", _repl, text)


# Allow Thai (\u0E00-\u0E7F), basic Latin, digits, and spacing/punctuation
THAI_ALLOWED_RE = re.compile(r"[^0-9a-zA-Z\u0E00-\u0E7F\s.,!?]")
BRACKET_EMOTE_RE = re.compile(r"\[[^\]]{1,24}\]")
REPEATED_CHARS_RE = re.compile(r"(.)\1{3,}", re.IGNORECASE)
MULTI_PUNCT_RE = re.compile(r"([.,!?])\1+")
MULTI_SPACE_RE = re.compile(r"\s+")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def clean_and_normalize_thai_text(raw_text: str) -> str:
    if not raw_text:
        return ""
    text = unicodedata.normalize("NFC", unicodedata.normalize("NFKC", str(raw_text)))
    for k, v in CHINESE_TO_THAI_MAP.items():
        text = text.replace(k, f" {v} ")

    text = BRACKET_EMOTE_RE.sub(" ", text)
    text = replace_numbers_with_thai_words(text)
    text = THAI_ALLOWED_RE.sub(" ", text)
    text = MULTI_PUNCT_RE.sub(r"\1", text)
    text = REPEATED_CHARS_RE.sub(r"\1\1", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip(" .,!?-")

    letters = re.findall(r"[a-zA-Z\u0E01-\u0E2E\u0E30-\u0E3A\u0E40-\u0E44]", text)
    if len(letters) < 2:
        return ""

    if len(text) > 240:
        text = text[:240].rsplit(" ", 1)[0]

    return text.strip()


def polish_waveform(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    """Remove DC offset, normalize peak <= 0.88, and apply cosine fade-in/out."""
    arr = np.asarray(wav, dtype=np.float32).reshape(-1)
    if arr.size == 0:
        return arr

    arr = arr - np.mean(arr)
    peak = float(np.max(np.abs(arr)))
    if peak > 0.001:
        arr = arr * (0.88 / peak)

    fade_in = min(int(sample_rate * 0.012), arr.size // 4)
    fade_out = min(int(sample_rate * 0.020), arr.size // 4)
    if fade_in > 1:
        ramp_in = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, fade_in, dtype=np.float32)))
        arr[:fade_in] *= ramp_in
    if fade_out > 1:
        ramp_out = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, fade_out, dtype=np.float32)))
        arr[-fade_out:] *= ramp_out

    return arr


def load_vits_model():
    if sherpa_onnx is None:
        return None
    model_file = VITS_MODEL_DIR / "model.onnx"
    tokens_file = VITS_MODEL_DIR / "tokens.txt"
    if not (model_file.is_file() and tokens_file.is_file()):
        return None
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(model_file),
                tokens=str(tokens_file),
            ),
            num_threads=3,
        )
    )
    return sherpa_onnx.OfflineTts(config)


def main() -> None:
    t0 = time.time()
    model_name = "Thai Neural TTS (VITS-MMS-THA ONNX + Google Thai TTS)"
    emit({"type": "status", "status": "loading", "model": model_name})

    vits_engine = None
    try:
        vits_engine = load_vits_model()
        voices = ["thai_female", "thai_vits"]
        default_voice = "thai_female"
        load_sec = round(time.time() - t0, 2)
        emit({
            "type": "ready",
            "model": model_name,
            "voice": default_voice,
            "voices": voices,
            "sampleRate": int(vits_engine.sample_rate) if vits_engine else 24000,
            "loadSec": load_sec,
        })
    except Exception as exc:
        emit({
            "type": "error",
            "fatal": False,
            "error": str(exc),
            "trace": traceback.format_exc(),
        })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            text = (req.get("text") or "").strip()
            voice = (req.get("voice") or "thai_female").strip().lower()
            if voice not in ("thai_female", "thai_vits"):
                voice = "thai_female"

            norm_text = clean_and_normalize_thai_text(text)
            if not norm_text:
                emit({"type": "result", "id": req_id, "ok": False, "error": "Filtered empty/spam text"})
                continue

            cache_key = hashlib.sha1(f"th_v2::{voice}::{norm_text}".encode("utf-8")).hexdigest()[:20]
            ext = "wav" if voice == "thai_vits" else "mp3"
            out_name = f"{voice}_{cache_key}.{ext}"
            out_path = CACHE_DIR / out_name

            if out_path.is_file() and out_path.stat().st_size > 200:
                emit({
                    "type": "result",
                    "id": req_id,
                    "ok": True,
                    "cached": True,
                    "voice": voice,
                    "file": out_name,
                    "url": f"/tts-cache/{out_name}",
                    "synthSec": 0.0,
                })
                continue

            t_synth = time.time()
            synthesized = False
            duration_sec = 3.5

            if voice == "thai_female" and gTTS is not None:
                try:
                    tts_obj = gTTS(text=norm_text, lang="th", slow=False)
                    tts_obj.save(str(out_path))
                    if out_path.is_file() and out_path.stat().st_size > 200:
                        synthesized = True
                        duration_sec = round(max(1.8, len(norm_text) * 0.09), 2)
                except Exception:
                    synthesized = False

            if not synthesized and vits_engine is not None:
                out_name = f"thai_vits_{cache_key}.wav"
                out_path = CACHE_DIR / out_name
                # Strip any leftover non-Thai characters for pure Thai VITS token compatibility
                vits_text = re.sub(r"[^\u0E00-\u0E7F\s]", " ", norm_text)
                vits_text = MULTI_SPACE_RE.sub(" ", vits_text).strip()
                if vits_text:
                    audio = vits_engine.generate(vits_text, sid=0, speed=1.0)
                    samples = np.asarray(audio.samples, dtype=np.float32)
                    if samples.size > 0:
                        clean_audio = polish_waveform(samples, int(audio.sample_rate))
                        sf.write(str(out_path), clean_audio, samplerate=int(audio.sample_rate), subtype="PCM_16")
                        synthesized = True
                        duration_sec = round(clean_audio.size / float(audio.sample_rate), 2)
                        voice = "thai_vits"

            if not synthesized:
                emit({"type": "result", "id": req_id, "ok": False, "error": "Thai TTS synthesis failed"})
                continue

            synth_sec = round(time.time() - t_synth, 2)
            emit({
                "type": "result",
                "id": req_id,
                "ok": True,
                "cached": False,
                "voice": voice,
                "file": out_name,
                "url": f"/tts-cache/{out_name}",
                "synthSec": synth_sec,
                "durationSec": duration_sec,
            })
        except Exception as exc:
            emit({
                "type": "result",
                "id": req_id,
                "ok": False,
                "error": str(exc),
            })


if __name__ == "__main__":
    main()
