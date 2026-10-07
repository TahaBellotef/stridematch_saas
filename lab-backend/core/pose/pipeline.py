# core/pose/pipeline.py
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from math import atan2, degrees
from typing import Optional, Union, Tuple, Sequence
import json

import av
import numpy as np
from PIL import Image

from app.visualization_config import OUT_W, OUT_H, MAX_VIDEO_SECONDS, MAX_FRAMES, POSE_FPS
from .consumers import FrameConsumer
from .smoothing_consumer import PoseSmoothingConsumer
from .results import PoseResultCompat, _lerp_pose
from .rtmpose_engine import PoseInferenceEngine

logger = logging.getLogger(__name__)

LOG_EVERY_FRAME = os.environ.get("POSE_LOG_EVERY_FRAME", "0").strip().lower() in {"1", "true", "yes", "y", "on"}
DISABLE_AUTO_ROTATE = os.environ.get("DISABLE_AUTO_ROTATE", "1").strip().lower() in {"1","true","yes","y","on"}    
# ============================================================
# Video source
# ============================================================
def _fps_from_counts(packet_count, duration_s, average_rate) -> float:
    """Pure fps resolution. Prefer the *measured* average rate (frames / duration),
    which is VFR/WEBM-safe and matches real playback; fall back to a plausible
    average_rate; else 30. Anything outside [1, 120] fps is treated as bogus."""
    if duration_s and duration_s > 0 and packet_count and packet_count > 1:
        measured = packet_count / duration_s
        if 1.0 <= measured <= 120.0:
            return float(measured)
    try:
        fps = float(average_rate) if average_rate else None
    except (TypeError, ValueError):
        fps = None
    if fps is not None and 1.0 <= fps <= 120.0:
        return fps
    return 30.0


def _resolve_fps(path, average_rate) -> float:
    """Robust real-time fps for the output encoder.

    Browser-recorded WEBM is variable-frame-rate: `stream.average_rate` is
    unreliable (often a nominal CFR value or the millisecond timebase) and
    `stream.frames` / `stream.duration` are absent. Trusting that rate makes the
    annotated result play many times too fast. We instead measure the true
    average rate from a cheap demux pass (packet count / container duration).
    """
    packet_count, duration_s = 0, None
    try:
        probe = av.open(str(path))
        try:
            pstream = next(s for s in probe.streams if s.type == "video")
            duration_s = (probe.duration / 1_000_000) if probe.duration else None
            packet_count = sum(1 for _ in probe.demux(pstream))
        finally:
            probe.close()
    except Exception:
        pass
    return _fps_from_counts(packet_count, duration_s, average_rate)


@dataclass
class VideoSource:
    path: Union[str, "Path"]

    def open(self):
        container = av.open(str(self.path), options={"noautorotate": "1"})
        stream = next(s for s in container.streams if s.type == "video")

        fps = _resolve_fps(str(self.path), stream.average_rate)

        return container, stream, fps



# ============================================================
# Encoder (ffmpeg sink) — store-ready MP4
# ============================================================

class FFmpegEncoder:
    def __init__(self, fps: float, width: int = OUT_W, height: int = OUT_H):
        self.width = width
        self.height = height
        self.output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name

        self._stderr_file = tempfile.NamedTemporaryFile(delete=False, suffix=".ffmpeg.log")
        self._stderr_path = self._stderr_file.name

        cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-pixel_format", "rgb24",
            "-video_size", f"{width}x{height}",
            "-framerate", str(fps),
            "-i", "-",
            "-map_metadata", "-1",
            "-map_metadata:s:v", "-1",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-vf", "setsar=1",
            "-metadata:s:v:0", "rotate=0",
            "-metadata:s:v", "rotate=0",
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
            self.output_path,
        ]

        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=self._stderr_file,
        )
        self._closed = False

    def write(self, image: Image.Image):
        if self._closed:
            return
        if self.proc is None or self.proc.stdin is None:
            return
        if self.proc.poll() is not None:
            return
        self.proc.stdin.write(image.tobytes())

    def close(self):
        if getattr(self, "_closed", False):
            return
        self._closed = True

        proc = getattr(self, "proc", None)

        try:
            if proc is not None and proc.stdin:
                try:
                    proc.stdin.flush()
                except Exception:
                    pass
                try:
                    proc.stdin.close()
                except Exception:
                    pass
        except Exception:
            pass

        try:
            if proc is not None:
                try:
                    proc.wait(timeout=30)
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    try:
                        proc.wait(timeout=5)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                        try:
                            proc.wait(timeout=5)
                        except Exception:
                            pass
        except Exception:
            pass

        try:
            self._stderr_file.flush()
        except Exception:
            pass
        try:
            self._stderr_file.close()
        except Exception:
            pass

        stderr_tail = ""
        try:
            with open(self._stderr_path, "rb") as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(max(0, size - 8192))
                stderr_tail = f.read().decode("utf-8", errors="replace")
        except Exception:
            stderr_tail = ""

        try:
            os.unlink(self._stderr_path)
        except Exception:
            pass

        output_size = 0
        try:
            output_size = os.path.getsize(self.output_path)
        except Exception:
            output_size = 0

        rc = None
        try:
            rc = proc.returncode if proc is not None else None
        except Exception:
            rc = None

        if rc not in (0, None) or output_size < 1024:
            msg = f"ffmpeg failed (rc={rc}, output_size={output_size} bytes)"
            debug = os.environ.get("APP_DEBUG", "").lower() in {"1", "true", "yes", "y", "on"}
            if debug and stderr_tail:
                msg = f"{msg}; stderr_tail={stderr_tail.strip()}"
            raise RuntimeError(msg)


# ============================================================
# Frame transformer
# ============================================================

def letterbox(frame: np.ndarray, target_w: int, target_h: int):
    """
    If aspect ratio matches target, just resize directly to avoid black bars.
    Otherwise letterbox.
    Returns:
      canvas (PIL), resized (PIL), resized_wh (nw,nh), offset (ox,oy)
    """
    h, w = frame.shape[:2]
    frame_aspect = w / h
    target_aspect = target_w / target_h

    if abs(frame_aspect - target_aspect) < 0.005:
        img = Image.fromarray(frame)
        resized = img.resize((target_w, target_h), Image.BILINEAR)
        return resized, resized, (target_w, target_h), (0, 0)

    s = min(target_w / w, target_h / h)
    nw, nh = int(w * s), int(h * s)

    img = Image.fromarray(frame)
    resized = img.resize((nw, nh), Image.BILINEAR)

    canvas = Image.new("RGB", (target_w, target_h), (0, 0, 0))
    ox = (target_w - nw) // 2
    oy = (target_h - nh) // 2
    canvas.paste(resized, (ox, oy))

    return canvas, resized, (nw, nh), (ox, oy)


def _parse_rotation(value: Optional[str]) -> int:
    if not value:
        return 0
    try:
        rotation = int(float(value))
    except (TypeError, ValueError):
        return 0
    rotation = rotation % 360
    if rotation < 0:
        rotation += 360
    if rotation % 90 != 0:
        rotation = int(round(rotation / 90.0) * 90) % 360
    return rotation


def _probe_rotation_pyav(stream) -> int:
    """Read rotation from PyAV stream metadata / side_data (no subprocess)."""
    try:
        # 1) Check 'rotate' tag in container metadata
        md = stream.metadata if hasattr(stream, "metadata") else {}
        rot = _parse_rotation(md.get("rotate") if md else None)
        logger.info(
            "probe_rotation_pyav: metadata=%s rotate_tag=%s",
            dict(md) if md else {}, md.get("rotate") if md else None,
        )
        if rot:
            logger.info("probe_rotation_pyav: found rotation=%d from metadata tag", rot)
            return rot

        # 2) Check side_data for display matrix rotation
        side_data = getattr(stream, "side_data", None) or {}
        logger.info(
            "probe_rotation_pyav: side_data type=%s keys=%s",
            type(side_data).__name__,
            list(side_data.keys()) if hasattr(side_data, "keys") else
            [type(sd).__name__ for sd in side_data] if hasattr(side_data, "__iter__") else "N/A",
        )
        if hasattr(side_data, "get"):
            display_matrix = side_data.get("DISPLAYMATRIX")
            if display_matrix is not None:
                logger.info("probe_rotation_pyav: DISPLAYMATRIX=%s", display_matrix)
                rot = _parse_rotation(str(display_matrix))
                if rot:
                    result = (360 - rot) % 360
                    logger.info("probe_rotation_pyav: found rotation=%d from display matrix", result)
                    return result
        elif hasattr(side_data, "__iter__"):
            for sd in side_data:
                logger.info("probe_rotation_pyav: side_data entry type=%s attrs=%s",
                            type(sd).__name__, dir(sd))
                if hasattr(sd, "type") and "display" in str(getattr(sd, "type", "")).lower():
                    rot_val = getattr(sd, "rotation", None)
                    if rot_val is not None:
                        rot = _parse_rotation(str(rot_val))
                        if rot:
                            result = (360 - rot) % 360
                            logger.info("probe_rotation_pyav: found rotation=%d from side_data", result)
                            return result

        logger.info("probe_rotation_pyav: no rotation detected, returning 0")
        return 0
    except Exception:
        logger.exception("probe_rotation_pyav: exception during rotation detection")
        return 0


USE_FFPROBE_ROTATION = os.environ.get("USE_FFPROBE_ROTATION", "0").strip().lower() in {"1", "true", "yes", "y", "on"}


def _probe_rotation_ffprobe(video_path: Union[str, "Path"]) -> int:
    """Fallback: probe rotation via ffprobe subprocess."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream_tags=rotate:stream_side_data",
        "-of", "json",
        str(video_path),
    ]

    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if p.returncode != 0 or not p.stdout:
            return 0

        data = json.loads(p.stdout)
        streams = data.get("streams") or []
        if not streams:
            return 0

        s0 = streams[0]

        tags = s0.get("tags") or {}
        rot = _parse_rotation(tags.get("rotate"))
        if rot:
            return rot

        for sd in s0.get("side_data_list") or []:
            if (sd.get("side_data_type") or "").lower() == "display matrix":
                rot = _parse_rotation(sd.get("rotation"))
                if rot:
                    return (360 - rot) % 360

        return 0
    except Exception:
        return 0


def _apply_rotation_cw(frame: np.ndarray, rotation_cw: int) -> np.ndarray:
    r = rotation_cw % 360
    if r == 90:
        return np.rot90(frame, k=3)
    if r == 180:
        return np.rot90(frame, k=2)
    if r == 270:
        return np.rot90(frame, k=1)
    return frame


# ============================================================
# Product-ready transform helper (request/env overrides)
# ============================================================

@dataclass(frozen=True)
class VideoTransform:
    rotate_cw: int = 0
    flip_x: bool = False
    flip_y: bool = False


def apply_transform(rgb: np.ndarray, t: VideoTransform) -> np.ndarray:
    rgb = _apply_rotation_cw(rgb, t.rotate_cw)
    if t.flip_x:
        rgb = np.ascontiguousarray(rgb[:, ::-1, :])
    if t.flip_y:
        rgb = np.ascontiguousarray(rgb[::-1, :, :])
    return rgb


def _env_bool(name: str) -> Optional[bool]:
    v = os.environ.get(name)
    if v is None:
        return None
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str) -> Optional[int]:
    v = os.environ.get(name)
    if v is None:
        return None
    try:
        return int(v)
    except Exception:
        return None


def _sanitize_rotate(r: Optional[int]) -> Optional[int]:
    if r is None:
        return None
    if isinstance(r, bool):
        return None
    try:
        r = int(r) % 360
    except Exception:
        return None
    return r if r in (0, 90, 180, 270) else None


def _as_bool(value: Optional[bool]) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    return None


# ============================================================
# RTMPose WholeBody indices we rely on (COCO-style)
# ============================================================

RTM_L_SH, RTM_R_SH = 5, 6
RTM_L_HIP, RTM_R_HIP = 11, 12
RTM_L_KNEE, RTM_R_KNEE = 13, 14
RTM_L_ANK, RTM_R_ANK = 15, 16
RTM_L_HEEL, RTM_R_HEEL = 24, 25


# ============================================================
# Auto rotation helpers (RTMPose-native)
# ============================================================

def _feet_down_margin(pose_res) -> float:
    if not pose_res or not getattr(pose_res, "pose_landmarks", None):
        return -1.0

    lm = pose_res.pose_landmarks.landmark
    if not lm or len(lm) <= RTM_R_ANK:
        return -1.0

    L_SH, R_SH = RTM_L_SH, RTM_R_SH
    L_ANK, R_ANK = RTM_L_ANK, RTM_R_ANK

    try:
        sh_y = (float(lm[L_SH].y) + float(lm[R_SH].y)) / 2.0
        ank_y = (float(lm[L_ANK].y) + float(lm[R_ANK].y)) / 2.0
    except Exception:
        return -1.0

    return float(ank_y - sh_y)


# ============================================================
# Pipeline runner (refactored into a class with discrete phases)
# ============================================================

class PipelineRunner:
    """Encapsulates the full pose-estimation + annotation pipeline."""

    def __init__(
        self,
        video_path: Union[str, "Path"],
        *,
        frame_consumer: Optional[FrameConsumer] = None,
        force_mirror: Optional[bool] = None,
        rotate_cw: Optional[int] = None,
        flip_x: Optional[bool] = None,
        flip_y: Optional[bool] = None,
    ):
        self.video_path = video_path
        self.frame_consumer = frame_consumer
        self.force_mirror = force_mirror

        # Request/env overrides
        self.req_flip_x = _as_bool(flip_x)
        self.req_flip_y = _as_bool(flip_y)
        self.env_flip_x = _env_bool("FORCE_FLIP_X")
        self.env_flip_y = _env_bool("FORCE_FLIP_Y")

        req_rot = _sanitize_rotate(rotate_cw)
        env_rot = _sanitize_rotate(_env_int("FORCE_ROTATE_CW"))
        self.rotate_override = req_rot if req_rot is not None else env_rot
        self.rotate_override_src = (
            "request" if req_rot is not None else ("env FORCE_ROTATE_CW" if env_rot is not None else "none")
        )

        # State (set during init phase)
        self.container = None
        self.stream = None
        self.fps: float = 30.0
        self.inference: Optional[PoseInferenceEngine] = None
        self.encoder: Optional[FFmpegEncoder] = None
        self.max_frames: int = MAX_FRAMES
        self.stride: int = 1
        self.out_w: int = OUT_W
        self.out_h: int = OUT_H

        # Rotation state
        self.base_rotation: int = 0
        self.base_rotation_src: str = "default_0"
        self.base_rotation_finalized: bool = True

        # Mirror detection state
        self.mirror_decision: Optional[bool] = None
        self.mirror_finalized: bool = False
        self.mirror_samples: int = 0
        self.mirror_votes: int = 0
        self.mirror_target: int = 10
        self.mirror_buffer_max: int = 60
        self.mirror_logged: bool = False

        # Upside-down detection state
        self.upside_down_detection_enabled: bool = self.env_flip_y is None
        self.upside_down_samples: int = 0
        self.upside_down_votes: int = 0
        self.upside_down_target: int = 10
        self.upside_down_finalized: bool = not self.upside_down_detection_enabled
        self.upside_down_decision: Optional[bool] = False if not self.upside_down_detection_enabled else None
        self.upside_down_logged: bool = False

        # Interpolation state
        self.prev_fresh_pose: Optional[PoseResultCompat] = None
        self.prev_fresh_idx: Optional[int] = None
        self.pending_between: list[tuple[int, np.ndarray, int]] = []
        self.buffered: list[tuple[int, np.ndarray, int]] = []
        self.final_transform: Optional[VideoTransform] = None
        self._probe_cache: dict[int, PoseResultCompat] = {}

    # ------------------------------------------------------------------
    # Phase 1: Initialization (open video, set up inference + encoder)
    # ------------------------------------------------------------------
    def _init_pipeline(self) -> None:
        source = VideoSource(self.video_path)
        self.container, self.stream, self.fps = source.open()
        self.inference = PoseInferenceEngine(fps=self.fps)

        fps = self.fps
        if fps and fps > 0:
            max_by_seconds = int(MAX_VIDEO_SECONDS * fps)
            self.max_frames = min(max_by_seconds, MAX_FRAMES)
            self.stride = max(1, int(round(fps / POSE_FPS))) if (POSE_FPS and POSE_FPS > 0) else 1
        else:
            self.max_frames = MAX_FRAMES
            self.stride = 1

        logger.info("Pose pipeline caps: fps=%.2f stride=%s max_frames=%s", fps, self.stride, self.max_frames)

        # Smoothing consumer wrapping
        enable_smoothing = os.environ.get("PIPELINE_POSE_SMOOTHING", "1").strip().lower() in {
            "1", "true", "yes", "y", "on"
        }
        if self.frame_consumer is not None and enable_smoothing:
            if getattr(self.frame_consumer, "disable_external_pose_smoothing", False):
                logger.info(
                    "pipeline: skipping PoseSmoothingConsumer for %s (internal smoothing enabled)",
                    self.frame_consumer.__class__.__name__,
                )
            else:
                self.frame_consumer = PoseSmoothingConsumer(
                    self.frame_consumer,
                    alpha=float(os.environ.get("POSE_SMOOTH_ALPHA", "0.22")),
                    vis_threshold=float(os.environ.get("POSE_VIS_THRESHOLD", "0.55")),
                    max_jump_px=float(os.environ.get("POSE_MAX_JUMP_PX", "90.0")),
                    landmark_indices=[
                        RTM_L_HIP, RTM_R_HIP,
                        RTM_L_KNEE, RTM_R_KNEE,
                        RTM_L_ANK, RTM_R_ANK,
                        RTM_L_HEEL, RTM_R_HEEL,
                    ],
                )

    # ------------------------------------------------------------------
    # Phase 2: Rotation + dimension detection
    # ------------------------------------------------------------------
    def _detect_rotation_and_dimensions(self) -> None:
        if USE_FFPROBE_ROTATION:
            probe_rotation = _probe_rotation_ffprobe(self.video_path)
        else:
            probe_rotation = _probe_rotation_pyav(self.stream)

        if self.rotate_override is not None:
            self.base_rotation = 0
            self.base_rotation_src = "override"
        elif probe_rotation != 0:
            self.base_rotation = probe_rotation
            self.base_rotation_src = "pyav" if not USE_FFPROBE_ROTATION else "ffprobe"
        else:
            self.base_rotation = 0
            self.base_rotation_src = "default_0"

        self.base_rotation_finalized = True
        logger.info(
            "rotation_policy: base_rotation=%d src=%s finalized=%s",
            self.base_rotation, self.base_rotation_src, self.base_rotation_finalized,
        )

        # Determine output dimensions
        _effective_rot = (self.base_rotation + (self.rotate_override if self.rotate_override is not None else 0)) % 360
        _src_w = self.stream.width or OUT_W
        _src_h = self.stream.height or OUT_H
        if _effective_rot in (90, 270):
            _rotated_w, _rotated_h = _src_h, _src_w
        else:
            _rotated_w, _rotated_h = _src_w, _src_h

        if _rotated_h > _rotated_w:
            self.out_w, self.out_h = OUT_H, OUT_W
        else:
            self.out_w, self.out_h = OUT_W, OUT_H

        self.encoder = FFmpegEncoder(self.fps, width=self.out_w, height=self.out_h)
        logger.info(
            "encoder_dimensions: %dx%d (source=%dx%d effective_rot=%d)",
            self.out_w, self.out_h, _src_w, _src_h, _effective_rot,
        )

    # ------------------------------------------------------------------
    # Phase 3: Mirror + upside-down detection setup
    # ------------------------------------------------------------------
    def _setup_mirror_detection(self) -> None:
        if self.force_mirror is True:
            self.mirror_decision = True
            self.mirror_finalized = True
        elif self.force_mirror is False:
            self.mirror_decision = False
            self.mirror_finalized = True
        else:
            self.mirror_decision = None
            self.mirror_finalized = False

        if self.env_flip_x is not None:
            self.mirror_decision = bool(self.env_flip_x)
            self.mirror_finalized = True

        if self.force_mirror is None and self.env_flip_x is None:
            self.mirror_decision = False
            self.mirror_finalized = True
            logger.info("mirror_policy: auto-mirror disabled (default).")

        self.mirror_buffer_max = max(self.mirror_target * self.stride * 3, 60)

        # Fast path: if both already finalized, compute transform immediately
        if self.mirror_finalized and self.upside_down_finalized:
            self.final_transform = self._compute_transform_final()
            logger.info("fast_path: transforms pre-determined, skipping buffer phase")

    # ------------------------------------------------------------------
    # Transform computation
    # ------------------------------------------------------------------
    def _compute_transform_final(self) -> VideoTransform:
        if self.env_flip_x is not None:
            base_fx = bool(self.env_flip_x)
            base_fx_src = "env FORCE_FLIP_X"
        elif self.mirror_decision is not None:
            base_fx = bool(self.mirror_decision)
            base_fx_src = "force_mirror" if self.force_mirror is not None else "mirror_detect"
        else:
            base_fx = False
            base_fx_src = "default"

        if self.env_flip_y is not None:
            base_fy = bool(self.env_flip_y)
            base_fy_src = "env FORCE_FLIP_Y"
        elif self.upside_down_detection_enabled and self.upside_down_finalized and self.upside_down_decision is not None:
            base_fy = bool(self.upside_down_decision)
            base_fy_src = "pose_detect"
        else:
            base_fy = False
            base_fy_src = "default"

        rot_override = self.rotate_override if self.rotate_override is not None else 0
        final_rot = (self.base_rotation + rot_override) % 360

        fx_toggle = True if self.req_flip_x is True else False
        fy_toggle = True if self.req_flip_y is True else False
        final_fx = base_fx ^ fx_toggle
        final_fy = base_fy ^ fy_toggle

        logger.info(
            "transform_final: base_rotation=%d(src=%s) rotate_override=%s(src=%s) => rot=%d | "
            "flip_x=%s(src=%s) flip_y=%s(src=%s)",
            self.base_rotation, self.base_rotation_src,
            rot_override, self.rotate_override_src,
            final_rot,
            final_fx, base_fx_src,
            final_fy, base_fy_src,
        )
        return VideoTransform(rotate_cw=final_rot, flip_x=final_fx, flip_y=final_fy)

    # ------------------------------------------------------------------
    # Probe sampling (mirror + upside-down votes)
    # ------------------------------------------------------------------
    def _sample_probes(self, idx: int, rgb_frame: np.ndarray, ts_ms: int) -> None:
        if idx % self.stride != 0:
            return

        need_mirror = not self.mirror_finalized and self.mirror_samples < self.mirror_target
        need_upside = (
            self.upside_down_detection_enabled
            and not self.upside_down_finalized
            and self.upside_down_samples < self.upside_down_target
        )
        if not need_mirror and not need_upside:
            return

        test = _apply_rotation_cw(rgb_frame, self.base_rotation) if self.base_rotation else rgb_frame
        _, resized, _, _ = letterbox(test, self.out_w, self.out_h)
        pose_res = self.inference.infer(resized, ts_ms)

        if pose_res is not None:
            self._probe_cache[idx] = pose_res

        if not pose_res or not getattr(pose_res, "pose_landmarks", None):
            return
        lm = pose_res.pose_landmarks.landmark
        if not lm:
            return

        # Mirror vote
        if need_mirror and len(lm) > RTM_R_SH:
            try:
                left_x = float(lm[RTM_L_SH].x)
                right_x = float(lm[RTM_R_SH].x)
                self.mirror_samples += 1
                if left_x > right_x:
                    self.mirror_votes += 1
            except Exception:
                pass

            if self.mirror_samples >= self.mirror_target:
                self.mirror_decision = (self.mirror_votes / self.mirror_samples) > 0.6 if self.mirror_samples else False
                self.mirror_finalized = True
                self._log_mirror()

        # Upside-down vote
        if need_upside:
            margin = _feet_down_margin(pose_res)
            if margin != -1.0:
                self.upside_down_samples += 1
                if margin < 0.0:
                    self.upside_down_votes += 1
                if self.upside_down_samples >= self.upside_down_target:
                    self.upside_down_decision = (self.upside_down_votes / self.upside_down_samples) > 0.6
                    self.upside_down_finalized = True
                    self._log_upside_down()

    def _log_mirror(self) -> None:
        if not self.mirror_logged and self.mirror_decision is not None:
            logger.info("mirror_detect: samples=%d mirrored=%s", self.mirror_samples, self.mirror_decision)
            self.mirror_logged = True

    def _log_upside_down(self) -> None:
        if not self.upside_down_logged and self.upside_down_detection_enabled and self.upside_down_decision is not None:
            logger.info("pose_inversion: samples=%d inverted=%s", self.upside_down_samples, self.upside_down_decision)
            self.upside_down_logged = True

    # ------------------------------------------------------------------
    # Frame processing helpers
    # ------------------------------------------------------------------
    def _process_frame(
        self,
        idx: int,
        rgb_frame: np.ndarray,
        ts_ms: int,
        t: VideoTransform,
        pose_res: Optional[PoseResultCompat],
        inference_tag: str,
        *,
        precomputed: Optional[tuple] = None,
    ) -> None:
        if precomputed is not None:
            canvas, resized_wh, offset = precomputed
        else:
            rgb_frame = apply_transform(rgb_frame, t)
            canvas, _resized, resized_wh, offset = letterbox(rgb_frame, self.out_w, self.out_h)

        if LOG_EVERY_FRAME:
            logger.info(
                "frame=%d tag=%s transform=rot%d flip_x=%s flip_y=%s resized=%s offset=%s canvas=%s",
                idx, inference_tag, t.rotate_cw, t.flip_x, t.flip_y,
                resized_wh, offset, canvas.size,
            )

        if self.frame_consumer:
            try:
                maybe_img = self.frame_consumer.consume(
                    idx, canvas, pose_res,
                    scale=resized_wh, offset=offset, transform=t,
                )
                if maybe_img is not None:
                    canvas = maybe_img
            except Exception:
                logger.exception("frame_consumer failed at frame_idx=%d; writing raw canvas", idx)

        self.encoder.write(canvas)

    def _infer_on_frame(self, rgb_frame: np.ndarray, ts_ms: int, t: VideoTransform):
        tr = apply_transform(rgb_frame, t)
        canvas, _resized, resized_wh, offset = letterbox(tr, self.out_w, self.out_h)
        try:
            pose_res = self.inference.infer(canvas, ts_ms)
        except Exception:
            logger.exception("pose_infer failed; continuing with no pose")
            pose_res = None
        return pose_res, canvas, resized_wh, offset

    # ------------------------------------------------------------------
    # Buffer flush (replay buffered frames once transform is known)
    # ------------------------------------------------------------------
    def _flush_buffer_with_transform(self, t: VideoTransform) -> None:
        self.prev_fresh_pose = None
        self.prev_fresh_idx = None
        self.pending_between.clear()

        for b_idx, b_rgb, b_ts_ms in self.buffered:
            if b_idx % self.stride == 0:
                cached = self._probe_cache.get(b_idx)
                if cached is not None:
                    tr = apply_transform(b_rgb, t)
                    canvas, _resized, resized_wh, offset = letterbox(tr, self.out_w, self.out_h)
                    fresh_pose = cached
                else:
                    fresh_pose, canvas, resized_wh, offset = self._infer_on_frame(b_rgb, b_ts_ms, t)

                if self.pending_between and self.prev_fresh_pose is not None and self.prev_fresh_idx is not None:
                    span = max(1, b_idx - self.prev_fresh_idx)
                    for j_idx, j_rgb, j_ts in self.pending_between:
                        t_norm = (j_idx - self.prev_fresh_idx) / float(span)
                        interp_pose = _lerp_pose(self.prev_fresh_pose, fresh_pose, t_norm)
                        self._process_frame(j_idx, j_rgb, j_ts, t, interp_pose, "interp")
                    self.pending_between.clear()
                elif self.pending_between:
                    for j_idx, j_rgb, j_ts in self.pending_between:
                        self._process_frame(j_idx, j_rgb, j_ts, t, fresh_pose, "reuse_no_anchor")
                    self.pending_between.clear()

                self._process_frame(b_idx, b_rgb, b_ts_ms, t, fresh_pose, "fresh",
                                    precomputed=(canvas, resized_wh, offset))
                self.prev_fresh_pose = fresh_pose
                self.prev_fresh_idx = b_idx
            else:
                self.pending_between.append((b_idx, b_rgb, b_ts_ms))

        if self.pending_between:
            for j_idx, j_rgb, j_ts in self.pending_between:
                self._process_frame(j_idx, j_rgb, j_ts, t, self.prev_fresh_pose, "tail_flush")
            self.pending_between.clear()

        self._probe_cache.clear()
        self.buffered.clear()

    # ------------------------------------------------------------------
    # Phase 4: Main decode loop
    # ------------------------------------------------------------------
    def _decode_frames(self) -> int:
        frame_idx = 0

        for frame in self.container.decode(video=0):
            if frame_idx >= self.max_frames:
                break

            rgb = frame.to_ndarray(format="rgb24")

            if frame.pts is not None and frame.time_base is not None:
                ts_ms = int(frame.pts * float(frame.time_base) * 1000.0)
            else:
                ts_ms = int(round((frame_idx / self.fps) * 1000.0))

            if self.final_transform is None:
                self.buffered.append((frame_idx, rgb, ts_ms))

                if self.base_rotation_finalized:
                    self._sample_probes(frame_idx, rgb, ts_ms)

                    if len(self.buffered) >= self.mirror_buffer_max:
                        if not self.mirror_finalized:
                            self.mirror_decision = (
                                (self.mirror_votes / self.mirror_samples) > 0.6
                                if self.mirror_samples else False
                            )
                            self.mirror_finalized = True
                            self._log_mirror()
                        if self.upside_down_detection_enabled and not self.upside_down_finalized:
                            self.upside_down_decision = (
                                (self.upside_down_votes / self.upside_down_samples) > 0.6
                                if self.upside_down_samples else False
                            )
                            self.upside_down_finalized = True
                            self._log_upside_down()

                if self.mirror_finalized and self.upside_down_finalized:
                    self.final_transform = self._compute_transform_final()
                    self._flush_buffer_with_transform(self.final_transform)

            else:
                if frame_idx % self.stride == 0:
                    fresh_pose, canvas, resized_wh, offset = self._infer_on_frame(rgb, ts_ms, self.final_transform)

                    if self.pending_between and self.prev_fresh_pose is not None and self.prev_fresh_idx is not None:
                        span = max(1, frame_idx - self.prev_fresh_idx)
                        for j_idx, j_rgb, j_ts in self.pending_between:
                            t_norm = (j_idx - self.prev_fresh_idx) / float(span)
                            interp_pose = _lerp_pose(self.prev_fresh_pose, fresh_pose, t_norm)
                            self._process_frame(j_idx, j_rgb, j_ts, self.final_transform, interp_pose, "interp")
                        self.pending_between.clear()
                    elif self.pending_between:
                        for j_idx, j_rgb, j_ts in self.pending_between:
                            self._process_frame(j_idx, j_rgb, j_ts, self.final_transform, fresh_pose, "reuse_no_anchor")
                        self.pending_between.clear()

                    self._process_frame(frame_idx, rgb, ts_ms, self.final_transform, fresh_pose, "fresh",
                                        precomputed=(canvas, resized_wh, offset))
                    self.prev_fresh_pose = fresh_pose
                    self.prev_fresh_idx = frame_idx
                else:
                    self.pending_between.append((frame_idx, rgb, ts_ms))

            frame_idx += 1

        return frame_idx

    # ------------------------------------------------------------------
    # Phase 5: Cleanup + force flush
    # ------------------------------------------------------------------
    def _finalize(self, frame_idx: int) -> None:
        # Flush remaining between frames (streaming path)
        if self.final_transform is not None and self.pending_between:
            for j_idx, j_rgb, j_ts in self.pending_between:
                self._process_frame(j_idx, j_rgb, j_ts, self.final_transform, self.prev_fresh_pose, "tail_flush")
            self.pending_between.clear()

        # Force flush if transform never finalized (short clip / low-confidence pose)
        if self.final_transform is None:
            logger.info(
                "force_flush: transform not finalized (base_rotation_finalized=%s mirror_finalized=%s "
                "upside_down_finalized=%s). Proceeding with safe defaults.",
                self.base_rotation_finalized, self.mirror_finalized, self.upside_down_finalized,
            )

            if not self.base_rotation_finalized:
                self.base_rotation = 0
                self.base_rotation_src = "force_flush_default"
                self.base_rotation_finalized = True

            if not self.mirror_finalized:
                self.mirror_decision = bool(self.env_flip_x) if self.env_flip_x is not None else False
                self.mirror_finalized = True

            if not self.upside_down_finalized:
                self.upside_down_decision = bool(self.env_flip_y) if self.env_flip_y is not None else False
                self.upside_down_finalized = True

            self.final_transform = self._compute_transform_final()
            self._flush_buffer_with_transform(self.final_transform)

        logger.info("Pose pipeline decoded frames: %s", frame_idx)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def run(self) -> tuple[str, float]:
        self._init_pipeline()
        self._detect_rotation_and_dimensions()
        self._setup_mirror_detection()

        try:
            frame_idx = self._decode_frames()
            self._finalize(frame_idx)
        finally:
            try:
                self.container.close()
            except Exception:
                pass
            try:
                self.inference.close()
            except Exception:
                pass
            self.encoder.close()

        return self.encoder.output_path, self.fps


def run_pipeline(
    video_path: Union[str, "Path"],
    *,
    frame_consumer: Optional[FrameConsumer] = None,
    force_mirror: Optional[bool] = None,
    rotate_cw: Optional[int] = None,
    flip_x: Optional[bool] = None,
    flip_y: Optional[bool] = None,
) -> tuple[str, float]:
    """Public API — delegates to PipelineRunner."""
    runner = PipelineRunner(
        video_path,
        frame_consumer=frame_consumer,
        force_mirror=force_mirror,
        rotate_cw=rotate_cw,
        flip_x=flip_x,
        flip_y=flip_y,
    )
    return runner.run()