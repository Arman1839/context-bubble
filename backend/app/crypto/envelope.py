import os
import base64
from typing import Tuple, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import x25519


class CryptoEnvelopeManager:
    """
    Implements Mode A E2EE Envelope Encryption:
    - Data stored in Firestore/GCS can be sealed with AES-256-GCM.
    - Wrapped per-bubble keys allow client-side key generation and exchange.
    - Crypto-shredding destroys key material upon bubble pop, rendering all remaining ciphertexts permanently irrecoverable.
    """

    @staticmethod
    def generate_bubble_key() -> bytes:
        """Generates a random 256-bit symmetric bubble master key."""
        return AESGCM.generate_key(bit_length=256)

    @staticmethod
    def encrypt_payload(data: bytes, key: bytes, associated_data: bytes = b"") -> Dict[str, str]:
        """Encrypts data using AES-256-GCM with a fresh 96-bit nonce."""
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, data, associated_data)
        return {
            "nonce": base64.b64encode(nonce).decode("utf-8"),
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
        }

    @staticmethod
    def decrypt_payload(encrypted_dict: Dict[str, str], key: bytes, associated_data: bytes = b"") -> bytes:
        """Decrypts AES-256-GCM ciphertext."""
        nonce = base64.b64decode(encrypted_dict["nonce"])
        ciphertext = base64.b64decode(encrypted_dict["ciphertext"])
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, associated_data)

    @staticmethod
    def generate_x25519_keypair() -> Tuple[str, str]:
        """Generates X25519 private/public keypair in base64 format for client key agreement."""
        private_key = x25519.X25519PrivateKey.generate()
        public_key = private_key.public_key()
        priv_b64 = base64.b64encode(private_key.private_bytes_raw()).decode("utf-8")
        pub_b64 = base64.b64encode(public_key.public_bytes_raw()).decode("utf-8")
        return priv_b64, pub_b64
