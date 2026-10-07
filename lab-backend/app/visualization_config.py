#
#  File: visualization_config.py
#  Project: StrideMatchLab
#  Video processing, annotation, and UI display constants.
#  Separated from config.py to avoid importing auth secrets
#  and triggering side effects in non-API contexts.
#

from app.config import _get_int, _get_float, _get_bool

# ============================================================
# Video output dimensions
# ============================================================

OUT_W, OUT_H = 1280, 720

# ============================================================
# Annotation colors (BGR for OpenCV)
# ============================================================

BLUE = (255, 102, 0)
GREEN = (57, 255, 20)
LABEL_BG = GREEN
LABEL_TXT = (25, 28, 35)

# ============================================================
# Video caps / pose sampling
# ============================================================

MAX_VIDEO_SECONDS = _get_int("MAX_VIDEO_SECONDS", 20)
MAX_FRAMES = _get_int("MAX_FRAMES", 600)
POSE_FPS = _get_float("POSE_FPS", 10.0)
STORE_DEBUG_SERIES = _get_bool("STORE_DEBUG_SERIES", False)
