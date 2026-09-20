-- WMS V2.1 DDL（PostgreSQL，可直接执行）
-- 永久约束 [PERMANENT]：前缀 DJ/RK/LY/TL/PD；ledger 只增不改；PD 不动账；
-- idem_key=doc_no:line_no:biz 唯一；数量必带 qty+unit；溯源到 BT 批级。

-- 主档
CREATE TABLE IF NOT EXISTS mat_master(
  material_code TEXT PRIMARY KEY,
  name TEXT NOT NULL, spec TEXT,
  unit TEXT NOT NULL, pack_qty NUMERIC NOT NULL DEFAULT 1,
  manage_mode TEXT NOT NULL DEFAULT 'QTY',
  status TEXT NOT NULL DEFAULT '启用'
);

-- 批次：建批即绑来源
CREATE TABLE IF NOT EXISTS batch(
  batch_no TEXT PRIMARY KEY,
  material_code TEXT NOT NULL REFERENCES mat_master(material_code),
  partner_id TEXT, source_doc_no TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT
);

-- 单件（BT 级溯源可不逐件建，散件/重点件建）
CREATE TABLE IF NOT EXISTS material_item(
  barcode TEXT PRIMARY KEY,
  material_code TEXT NOT NULL REFERENCES mat_master(material_code),
  batch_no TEXT NOT NULL REFERENCES batch(batch_no),
  source_doc_no TEXT, status TEXT NOT NULL DEFAULT '在库'
);

-- 现存快照（问答默认查它，快）
CREATE TABLE IF NOT EXISTS stock_onhand(
  material_code TEXT NOT NULL, batch_no TEXT NOT NULL,
  wh TEXT NOT NULL, loc TEXT NOT NULL,
  on_hand NUMERIC NOT NULL DEFAULT 0, avail NUMERIC NOT NULL DEFAULT 0,
  pending NUMERIC NOT NULL DEFAULT 0, quarantine NUMERIC NOT NULL DEFAULT 0,
  frozen NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY(material_code, batch_no, wh, loc)
);

-- 流水（只增不改，仲裁以它为准；过账唯一入口写）
CREATE TABLE IF NOT EXISTS stock_ledger(
  id BIGSERIAL PRIMARY KEY,
  doc_no TEXT NOT NULL, line_no INT NOT NULL DEFAULT 1,
  material_code TEXT NOT NULL, batch_no TEXT, barcode TEXT,
  wh TEXT, loc TEXT, qty NUMERIC NOT NULL, unit TEXT NOT NULL,
  dir CHAR(1) NOT NULL CHECK (dir IN ('+','-')),
  biz TEXT NOT NULL,
  by_user TEXT NOT NULL, device TEXT,
  at TIMESTAMPTZ DEFAULT now(),
  idem_key TEXT UNIQUE NOT NULL
);

-- 关联：JS<->RK、TK<->RK/LY、TL<->LY、PD->TK/RK
CREATE TABLE IF NOT EXISTS stock_doc_ref(
  id SERIAL PRIMARY KEY,
  from_doc TEXT NOT NULL, to_doc TEXT NOT NULL, rel TEXT NOT NULL,
  UNIQUE(from_doc, to_doc, rel)
);

-- 单据主/行（MVP 仅 DJ/RK/LY/TL/PD）
CREATE TABLE IF NOT EXISTS doc_main(
  doc_no TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DJ','RK','LY','TL','PD')),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  handler TEXT, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS doc_line(
  doc_no TEXT NOT NULL REFERENCES doc_main(doc_no),
  line_no INT NOT NULL,
  material_code TEXT NOT NULL, batch_no TEXT,
  qty NUMERIC NOT NULL, unit TEXT NOT NULL,
  PRIMARY KEY(doc_no, line_no)
);

-- 附件/扫码/OCR/审计/AI 问答日志
CREATE TABLE IF NOT EXISTS doc_attachment(
  id SERIAL PRIMARY KEY, doc_no TEXT NOT NULL,
  kind TEXT NOT NULL, ref TEXT NOT NULL,
  by_user TEXT, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scan_log(
  id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, result TEXT NOT NULL,
  doc_no TEXT, by_user TEXT, device TEXT, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocr_document(
  ocr_id TEXT PRIMARY KEY, doc_no TEXT,
  conf NUMERIC, ref TEXT, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocr_field_result(
  ocr_id TEXT NOT NULL REFERENCES ocr_document(ocr_id),
  field TEXT NOT NULL, candidate TEXT, conf NUMERIC,
  PRIMARY KEY(ocr_id, field)
);
CREATE TABLE IF NOT EXISTS audit_log(
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(),
  by_user TEXT NOT NULL, action TEXT NOT NULL,
  doc_no TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS ai_qa_log(
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(),
  by_user TEXT, question TEXT NOT NULL, sql TEXT NOT NULL,
  rows INT, ms INT
);
