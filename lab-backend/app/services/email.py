# app/services/email.py
"""
Outbound email sending (currently SMTP-backed).

Kept behind a single `send_email_with_attachment` function so the transport
can be swapped for AWS SES later without touching call sites — only this
file would change.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import (
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_USE_TLS,
)

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """Raised when SMTP credentials are missing from the environment."""


class EmailSendError(RuntimeError):
    """Raised when the SMTP server rejects or fails to send the message."""


def is_email_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL)


def send_email_with_attachment(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    attachment_bytes: bytes,
    attachment_filename: str,
    attachment_mimetype: str = "application/pdf",
) -> None:
    """
    Send an HTML email with a single binary attachment via SMTP.

    Blocking (smtplib) — callers in async code should run this in a thread pool.
    """
    if not is_email_configured():
        raise EmailNotConfiguredError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD "
            "and SMTP_FROM_EMAIL in the environment."
        )

    message = MIMEMultipart("mixed")
    message["Subject"] = subject
    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    message["To"] = to_email

    message.attach(MIMEText(html_body, "html"))

    maintype, _, subtype = attachment_mimetype.partition("/")
    part = MIMEApplication(attachment_bytes, _subtype=subtype or "octet-stream")
    part.add_header("Content-Disposition", "attachment", filename=attachment_filename)
    message.attach(part)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], message.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Failed to send report email to %s: %s", to_email, exc)
        raise EmailSendError(str(exc)) from exc
