-- 0002: fee_settle 增加更新时间(确认/重跑种子时自动刷新),字典同步见 wms.sql
ALTER TABLE fee_settle
  ADD COLUMN updated_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    COMMENT '行更新时间:确认/改数自动刷新' AFTER biz_status;
