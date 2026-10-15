-- 0006: 加工费对账确认留痕(核对人/核对时间/财务备注)
ALTER TABLE fee_settle
  ADD COLUMN confirm_note VARCHAR(255) DEFAULT NULL COMMENT '财务核对备注' AFTER biz_status,
  ADD COLUMN confirmed_by VARCHAR(64) DEFAULT NULL COMMENT '核对人' AFTER confirm_note,
  ADD COLUMN confirmed_at DATETIME DEFAULT NULL COMMENT '核对时间' AFTER confirmed_by;
