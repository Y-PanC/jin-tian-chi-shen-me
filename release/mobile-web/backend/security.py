import hashlib
import hmac
import secrets


def hash_password(password):
    salt = secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)
    return f"scrypt${salt}${value.hex()}"


def verify_password(password, stored):
    try:
        method, salt, expected = stored.split("$")
        if method != "scrypt":
            return False
        value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(value.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()
