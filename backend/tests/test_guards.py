"""AI 护栏单元测试：单条 SELECT + 表白名单 + MySQL5.6 方言 + LIMIT<=200。"""
from app.core import guards


def test_deny_insert():
    assert guards.check_sql("INSERT INTO doc_main VALUES(1)") != ""


def test_allow_select_whitelist():
    assert guards.check_sql("SELECT doc_no FROM doc_main") == ""


def test_allow_join_whitelist():
    assert guards.check_sql(
        "SELECT a.doc_no FROM doc_main a JOIN batch b ON a.id=b.doc_id") == ""


def test_deny_cte():
    assert guards.check_sql("WITH a AS (SELECT 1) SELECT * FROM a") != ""


def test_deny_question_posting():
    assert guards.check_question("帮我过账这批货") != ""


def test_deny_limit_too_large():
    assert guards.check_sql("SELECT * FROM doc_main LIMIT 500") != ""


def test_deny_table_not_whitelisted():
    assert guards.check_sql("SELECT * FROM sys_user") != ""


def test_question_rejects_window_json():
    # 实际规则只拦截 over( （带括号的窗口函数），不含括号不拦
    assert guards.check_question("用 over() 窗口函数统计") != ""


def test_question_limit_cap():
    assert guards.check_question("SELECT * FROM doc_main LIMIT 999") != ""


def test_question_safe():
    assert guards.check_question("库存还有多少") == ""
