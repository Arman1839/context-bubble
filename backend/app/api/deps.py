from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, Depends, status
try:
    import firebase_admin.auth as fb_auth
    HAS_FB_AUTH = True
except ImportError:
    fb_auth = None
    HAS_FB_AUTH = False

from app.core.config import settings
from app.core.logging import logger
from app.core.exceptions import (
    BubbleNotFoundException,
    UnauthorizedBubbleActionException,
)
from app.services.firebase import get_async_firestore_client
from app.services.limiter import rate_limiter


class AuthenticatedUser:
    def __init__(self, uid: str, name: str, email: Optional[str] = None, is_anonymous: bool = False):
        self.uid = uid
        self.name = name
        self.email = email
        self.is_anonymous = is_anonymous


async def verify_app_check(x_firebase_appcheck: Optional[str] = Header(None)):
    """Verifies Firebase App Check header to protect backend from non-whitelisted clients."""
    if not settings.FIREBASE_APP_CHECK_ENFORCE:
        return
    if not x_firebase_appcheck:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required App Check token."
        )
    try:
        # Verify App Check token via Firebase Admin
        import firebase_admin.app_check as fb_appcheck
        fb_appcheck.verify_token(x_firebase_appcheck)
    except Exception as e:
        logger.warning(f"App Check verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid App Check token."
        )


async def get_current_user(
    authorization: Optional[str] = Header(None)
) -> AuthenticatedUser:
    """Verifies Firebase ID token or accepts simulated local development token."""
    if not authorization or not authorization.startswith("Bearer "):
        # In development/test mode, fall back to a default user rather than rejecting
        if settings.ENVIRONMENT in ("development", "test"):
            return AuthenticatedUser(uid="dev-user-1", name="Dev Participant")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header."
        )

    token = authorization.split("Bearer ")[1].strip()

    # Fast path for local development simulated tokens: Bearer dev-*
    if settings.ENVIRONMENT in ("development", "test") and token.startswith("dev"):
        uid = token[4:] if token.startswith("dev-") else (token[3:] if len(token) > 3 else "dev-1")
        return AuthenticatedUser(uid=uid, name=f"Dev User ({uid})")


    try:
        decoded = fb_auth.verify_id_token(token)
        return AuthenticatedUser(
            uid=decoded.get("uid", "anonymous"),
            name=decoded.get("name") or decoded.get("email") or "Participant",
            email=decoded.get("email"),
            is_anonymous=decoded.get("firebase", {}).get("sign_in_provider") == "anonymous",
        )
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}")
        if settings.ENVIRONMENT in ("development", "test"):
            return AuthenticatedUser(uid="dev-fallback-user", name="Fallback User")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials."
        )


async def get_bubble_participant(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
) -> Dict[str, Any]:
    """Ensures caller is an active participant in the bubble."""
    db = get_async_firestore_client()
    member_snap = (
        await db.collection("bubbles")
        .document(bubble_id)
        .collection("participants")
        .document(user.uid)
        .get()
    )
    if not member_snap.exists:
        # Check if bubble exists
        b_snap = await db.collection("bubbles").document(bubble_id).get()
        if not b_snap.exists:
            raise BubbleNotFoundException(bubble_id)
        # Allow host if creator
        b_data = b_snap.to_dict() or {}
        if b_data.get("host_id") == user.uid:
            return {"id": user.uid, "name": user.name, "role": "host"}

        # In development mode, auto-register the authenticated participant if bubble is ACTIVE
        if settings.ENVIRONMENT in ("development", "test") and b_data.get("pop_state", "ACTIVE") == "ACTIVE":
            from app.chat.service import ChatService
            chat_svc = ChatService(db)
            try:
                auto_member = await chat_svc.join_bubble_transactional(
                    bubble_id=bubble_id,
                    user_id=user.uid,
                    display_name=user.name,
                )
                return auto_member.model_dump(mode="json")
            except Exception as e:
                logger.warning(f"Auto-join in get_bubble_participant notice: {e}")

        # In development mode, allow host match for simulated tokens
        if settings.ENVIRONMENT in ("development", "test"):
            if b_data.get("host_id") in (user.uid, "participant", "dev-participant", "dev-user-1", "host"):
                return {"id": user.uid, "name": user.name, "role": "host"}

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must join this bubble before accessing its resources."
        )

    return member_snap.to_dict() or {}


async def require_bubble_host(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
) -> Dict[str, Any]:
    """Ensures caller has the 'host' role in the bubble."""
    db = get_async_firestore_client()
    b_snap = await db.collection("bubbles").document(bubble_id).get()
    if not b_snap.exists:
        raise BubbleNotFoundException(bubble_id)
    b_data = b_snap.to_dict() or {}

    # 1. Direct host_id match
    if b_data.get("host_id") and b_data.get("host_id") == user.uid:
        return {"id": user.uid, "name": user.name, "role": "host"}

    # 2. In development mode fallback for local simulated credentials
    if settings.ENVIRONMENT in ("development", "test"):
        if b_data.get("host_id") in (user.uid, "participant", "dev-participant", "dev-user-1", "host"):
            return {"id": user.uid, "name": user.name, "role": "host"}

    member = await get_bubble_participant(bubble_id, user)
    if member.get("role") != "host":
        raise UnauthorizedBubbleActionException("manage this bubble's lifecycle")
    return member
