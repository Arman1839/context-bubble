import json
import logging
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict


# Regex patterns for sensitive data redaction
EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
BEARER_PATTERN = re.compile(r"Bearer\s+([a-zA-Z0-9_\-\.]+)", re.IGNORECASE)
API_KEY_PATTERN = re.compile(r"(AIza[0-9A-Za-z-_]{35}|sk-ant-[0-9A-Za-z-_]{30,}|sk-[0-9A-Za-z-_]{20,})")
PHONE_PATTERN = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")


def redact_string(val: str) -> str:
    val = BEARER_PATTERN.sub("Bearer [REDACTED_TOKEN]", val)
    val = API_KEY_PATTERN.sub("[REDACTED_API_KEY]", val)
    val = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", val)
    val = PHONE_PATTERN.sub("[REDACTED_PHONE]", val)
    return val


def sanitize_dict(data: Any) -> Any:
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(s in k_lower for s in ("password", "secret", "token", "authorization", "api_key", "key")):
                sanitized[k] = "[REDACTED_SECRET]"
            elif k_lower in ("text", "content", "transcript", "raw_text"):
                # Non-sensitive logging rule: only log length/hash of user content, never raw text
                sanitized[k] = f"[CONTENT_REDACTED len={len(str(v)) if v else 0}]"
            else:
                sanitized[k] = sanitize_dict(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_dict(item) for item in data]
    elif isinstance(data, str):
        return redact_string(data)
    return data


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_string(record.getMessage()),
        }
        if hasattr(record, "bubble_id"):
            payload["bubble_id"] = getattr(record, "bubble_id")
        if hasattr(record, "user_id"):
            payload["user_id"] = getattr(record, "user_id")
        if hasattr(record, "extra_fields"):
            extra = getattr(record, "extra_fields")
            if isinstance(extra, dict):
                payload.update(sanitize_dict(extra))
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger("context_bubble")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    return logger


logger = setup_logging()
