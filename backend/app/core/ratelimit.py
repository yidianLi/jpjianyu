"""登录失败限流:滑动窗口按账号计数,失败超阈值短时间内拒绝(防爆破).

单进程内存实现,适合单点单实例部署;多实例部署需换 Redis/DB 共享计数.
纯标准库,线程安全(dict 读写加锁).
"""
import threading
import time

_LOCK = threading.Lock()
_FAILS = {}  # key -> [fail_timestamps]


def is_blocked(key: str, max_fail: int = 5, window: int = 300):
    """返回 (blocked, retry_after_seconds). 窗口内失败达到 max_fail 即封锁."""
    now = time.time()
    with _LOCK:
        arr = [t for t in _FAILS.get(key, []) if now - t < window]
        _FAILS[key] = arr
        if len(arr) >= max_fail:
            return True, max(1, int(window - (now - arr[0])))
        return False, 0


def record_fail(key: str, window: int = 300):
    now = time.time()
    with _LOCK:
        arr = [t for t in _FAILS.get(key, []) if now - t < window]
        arr.append(now)
        _FAILS[key] = arr


def clear(key: str):
    with _LOCK:
        _FAILS.pop(key, None)
