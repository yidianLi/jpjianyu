"""登录限流单元测试:滑动窗口失败计数与封锁/清除。"""
from app.core import ratelimit


def test_block_after_max_fail():
    key = "ut:block"
    ratelimit.clear(key)
    for _ in range(5):
        blocked, _ = ratelimit.is_blocked(key)
        assert not blocked
        ratelimit.record_fail(key)
    blocked, retry = ratelimit.is_blocked(key)
    assert blocked and retry > 0


def test_clear_resets():
    key = "ut:clear"
    ratelimit.clear(key)
    for _ in range(5):
        ratelimit.record_fail(key)
    assert ratelimit.is_blocked(key)[0]
    ratelimit.clear(key)
    assert not ratelimit.is_blocked(key)[0]
