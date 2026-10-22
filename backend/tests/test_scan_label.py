"""扫码解析单元测试：标签文本抽取(parse_label)与码制名称映射.

不连库:只测纯函数.parse_label 覆盖二维码整串标签的多种写法。
"""
from app.routers.app_scan import parse_label


def test_parse_label_colon():
    f = parse_label("物料:HD-NK-005;数量:5;批次:IT-QC-3dcc6e;库位:WH-A-01")
    assert f["material_code"] == "HD-NK-005"
    assert f["qty"] == "5"
    assert f["batch_no"] == "IT-QC-3dcc6e"
    assert f["loc"] == "WH-A-01"


def test_parse_label_equals_and_comma():
    f = parse_label("物料编码=HD-ZP-011,数量=12,批次号=B2026")
    assert f["material_code"] == "HD-ZP-011"
    assert f["qty"] == "12"
    assert f["batch_no"] == "B2026"


def test_parse_label_chinese_colon_and_pipe():
    f = parse_label("物料：HD-OXF-001｜数量：3｜品名：牛津布")
    assert f["material_code"] == "HD-OXF-001"
    assert f["qty"] == "3"
    assert f["name"] == "牛津布"


def test_parse_label_empty():
    assert parse_label("") == {}
    assert parse_label(None) == {}


def test_parse_label_plain_text_no_fields():
    # 纯文本没有键值对时抽不到字段(由 lookup 走候选物料兜底)
    assert parse_label("纽扣") == {}
