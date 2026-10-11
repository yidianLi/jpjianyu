# NB3 数据库设计思路与编号规则方法论

> 来源：`20260825114604.nb3`（Navicat Backup，`tar + gzip`）
> 全局：`DatabaseType=MYSQL, Schema=jpsoft_db4, MetaVersion=30100`
> 规模：`128` 张表 + `3 Event + 2 Procedure + 1 Function`，共 `243` 个包成员
> 业务：`jp_` 底座 + `fs_固定资产 + as_档案 + cs_耗材` 三个平行域
> 数据：数据行是正常中文 `UTF-8`，仅 `DDL COMMENT` 乱码（中文按 `latin1` 存 `GBK` 的双重编码），不影响学规则

包结构：

```text
meta.json                                  # 全局清单
<UUID>.meta.json.gz                        # 每对象的 DDL
<UUID>.data.00000.sql.gz                   # 每表的数据（大表分片，如 fs_bom 分 4 片）
```

---

## 1. 总纲：两套主键并存

| 类型 | 做法 | 字段举例 |
|---|---|---|
| 语义编码主键 | 值本身就是分类 + 顺序，人可读，可写进代码 `switch` | `SOFT_TYPE, PID, MID, SID, STATE(SID), BILL_NO, CLASS_CODE, SEQNAME` |
| 代理键主键 | 无意义自增 + `AUTOCODE / P_xxx` 表达树 | `CID, DID, CSID, CTID, WHID, BOMID, BID, UID, RID` |

原则：**需要人眼识别、写进代码分支的，用语义编码；会无限增长的业务数据，用代理键。**

---

## 2. `SOFT_TYPE`：产品线编码，千位区分

`jp_soft_type` 全表 8 行：

```text
(0, '*', '公共部分')
(1000, 'FS', '固定资产')
(1100, 'CS', '办公耗材')
(2000, 'AS', '信贷档案')
(3000, 'FA', '一级信贷档案')
(4000, 'CA', '综合档案')
(5000, 'HA', '人事档案')
(6000, 'TA', '税务征管档案')
```

规则：

- `0=公共，1xxx=资产线，2xxx~7xxx=各类档案`。
- `1000/1100` 共用 `fs_` 域，`2000` 用 `as_` 域。
- `jp_menu / jp_security / jp_page / jp_role / jp_user` 都有 `SOFT_TYPE` 做隔离。
- `jp_security` 横向展开：`PID, PID_1000, PID_2000, PID_3000 ... PID_8000`，同一权限点在不同产品线挂不同页面。

技巧：一套代码卖多套产品，靠 `SOFT_TYPE + PID_xxxx` 列切换。

---

## 3. `PID`：8~9 位十进制分段（域名 + 模块 + 动作）

`jp_page 210` 行，`PID` 是全系统的页面 / 功能号。`(PID, SOFT_TYPE, 标题)`：

```text
1, 0, '公共'
1000, 1000, '固定资产'
11000, 1000, '固定资产工单默认设置'
12000, 2000, '信贷档案工单默认设置'
9100000, 0, '主页-多系统'
9101000, 1000, '  固定资产管理软件'      # = 9100000 + SOFT_TYPE
101000, 1000, '  固定资产管理软件'       # = 100000 + SOFT_TYPE
20000000, 0, '---固定资产管理---'        # 章节头，CLASS_NAME 为空
20001000, 1000, '  资产登记'
20001100, 1000, '  统购入库'
20001600, 1000, '  资产调拨'             # 分组头
20001610, 1000, '    部门调拨'
20001640, 1000, '    单位调拨'
29990100, 1000, '  预警中心-资产到期'    # 恰好等于 EVENT 名 TOTAL_WARNING_29990100 后缀
200000100, 0, '机构编码'                 # 9 位，基础数据段
```

解码：

- `1~12100`：系统保留小号。`1/1000/2000` 是三套根，`11000/12000` 是工单默认模板，`SCRIPT_TEXT` 写死 `DefaultPageKey := 11000`，不可改。
- `10xxxxxx`：系统设置。`10000200/10000220` 是同一功能在 `1000/2000` 线的两个挂载。
- `20xxxxxx`：固定资产；`21xxxxxx`：耗材；`32xxxxxx`：档案。整千万如 `20000000/30000000` 是章节分隔行，前端渲染成分组标题。
- `2000xxxx` 内：`20001xxx` 登记入库领用，`20004xxx` 出租，`20005xxx` 报废，`21100xxx` 盘点，`2998xxxx` 报表中心，`2999xxxx` 预警中心。
- `200000100~200002700`：基础数据，步长 `100`。`...100` 机构、`...300` 库房、`...800` 分类、`...500` 变更方式，顺序即菜单顺序。

`jp_page.SCRIPT_TEXT` 工单页模板（仅差一个数字）：

```pascal
this.DefaultPageKey := 11000;
this.PageAction := 10100;   // 统购，= fs_state.SID
this.ShowEditPanel := False;
this.ListAddingOpened := true;
this.RequireOpinion := false;
this.SequenceID := 'FS_BILL.BID';
this.SequenceNo := 'FS_BILL.NO';
```

结论：**`PID` 管菜单，`PageAction(=fs_state.SID)` 管行为，一页一状态。**

---

## 4. `MID / SID`：菜单和权限与 `PID` 同步编码

`jp_menu 250` 行 `(MID, P_MID, ...)`：

```text
9100000, -1, '主页'
10000000, -1, '系统管理'
10000200, 10000000, '系统设置'
20000000, -1, '固定资产管理'
20001000, 20000000, '资产登记'
```

- `MID` 几乎与 `PID` 同值，`P_MID=-1` 为根。
- 排序不用 `MID`，用 `GIDX(组号) + IDX(组内号)`。
- `LOWEST: 0=分组 1=叶子`。

`jp_security 1626` 行 `(SID, P_SID, LOWEST, SC_CODE, SC_NAME, PID, ...)`：

```text
1000000000, -1, 0, NULL, '系统管理', 10000000, ...
1000020000, 1000000000, 0, NULL, '系统设置', ...
1000020002, 1000020000, 1, 'ROOT', '查看', ...
1000020004, 1000020000, 1, 'EDIT', '修改', ...
1000020006, 1000020000, 1, 'PRINT', '打印', ...
```

- 组号步长 `10000`（`...20000 → ...30000`）。
- 组内叶子步长 `2`（`...0002 ROOT, ...0004 ADD/EDIT, ...0006 ...`），只用偶数，奇数预留插项。
- `SC_CODE` 仅 `ROOT / ADD / EDIT / DELETE / PRINT / MENUEDIT / SECURITYEDIT` 几个动词。

---

## 5. `CID / AUTOCODE`：十进制分层（全库最值得抄的一笔）

`jp_company 17` 行 `(CID, P_CID, CO_CODE, CO_NAME, AUTOCODE, LOWEST, ...)`：

```text
0, -1, '10', '广州简普科技', '001', 0
1000000000, 0, '1010', '单位本部', '001001', 1
3000000000, 0, '1030', '第三分公司', '001003', 0
3001000000, 3000000000, '103001', '湖北分公司', '001003001', 1
9001000000, 9000000000, '11101', '虹桥', '001009001', 0
9001001000, 9001000000, '1110101', '金山', '001009001001', 0
9001001001, 9001001000, '111010101', '宝金路', '001009001001001', 1
```

- `AUTOCODE`：每级 3 位定长路径码，`001 / 001003 / 001003001`，字符串排序即树排序。
- `CID`：数值版，每级占 `1000`（`1e9 / 1e6 / 1e3 / 1`）：

```text
一级: N * 1000000000        1000000000, 2000000000
二级: 父 + M * 1000000      3001000000 = 3000000000 + 1*1e6
三级: 父 + K * 1000         9001001000 = 9001000000 + 1000
四级: 父 + 1                9001001001 = 9001001000 + 1
```

- `jp_app_ini` 恰好配了 `CO_LEVEL_COUNT=4, CO_LEVEL_PER=1000`，编码容量由配置声明。`bigint` 最多撑 8 级。
- `jp_dept` 的 `DID` 是普通自增（`2,3,4...10000015`），树靠 `P_DID + AUTOCODE('001','002001')`。组织极稳定用编码主键，高频变动用代理键。
- `fs_class 3482` 行三码并存 `(CSID, P_CSID, CLASS_CODE, CLASS_NAME, AUTOCODE, LOWEST)`：

```text
1, -1, 'A01000000', '房屋和构筑物', '001', 0
2, 1,  'A01010000', '房屋',         '001001', 0
3, 2,  'A01010100', '办公用房',     '001001001', 1
```

`CSID` 自增，`CLASS_CODE` 国标码（含字母），`AUTOCODE` 自有 3 位排序码。`as_catalog.CTID / fs_warehouse.WHID / WCID` 同套。

---

## 6. `SID` 状态码：首位分域，百位分动作，列名即流转表

`fs_state 37` 行、`as_state 27` 行、`cs_state 4` 行。`SID` 手工语义号，非自增：

```text
fs: 10000 登记, 10050 变更, 10100 统购, 10200 划拨, 10250 退还,
    10300 入库, 10400 领用, 10410 借用, 10500 归还,
    10610 部门调拨, 10640 单位调拨, 10670 个人调拨, 10680 责任人变更,
    10700 送修, 13000 盘库, 13100 实物盘点,
    14000 出租, 14900 待报废, 14950 待报废转用, 15000 报废,
    15200 丢失, 15300 转让, 15400 出售, 15500 赠送, 19000 变卖, 19900 清理
as: 20000 建档, 21100 移交, 21200 接收, 21300 拒收, 21400 退收,
    22100 归档, 22200 借阅(本), 22300 借阅(跨), 22400 归还,
    25xxx 盘库, 26xxx 贷后, 28xxx 电子借阅, 29xxx 结清/销毁/清理
cs: 18300 入库, 18400 领用, 18500 退还, 18600 退货
```

- 万位 `1=资产 2=档案 18=耗材`；千百位是业务阶段；`x50` 是同阶段变体（`10000→10050, 10200→10250, 14900→14950`）。
- `STATE_STATUS 0/1` 控制是否在台账状态列显示；`STATE 0/1` 控制是否启用。
- 状态机不用流转表，列名写成目标 `SID`：`fs_state` 有 `S10050,S10100...S19900` 近 30 列，`as_state` 有 `S21100...S29900`，单元格 `0/1` 表示能否从本行发起该列动作。
- `fs_bill.SID=10410` 表示“这张工单是借用”；`fs_bom.STATE=10400` 表示“资产当前在用”。**一张工单只干一件事，工单驱动状态。**

---

## 7. `BILL_NO / SEQUENCE`：前缀字母 + `[SERIAL:6]` + 中央发号

`fs_state.BILL_NO_FORMAT`：

```text
10100 'TG[SERIAL:6]' 统购, 10200 'HB[SERIAL:6]' 划拨, 10300 'RK[SERIAL:6]' 入库,
10400 'YY[SERIAL:6]' 领用, 10410 'JY[SERIAL:6]' 借用, 10500 'GH[SERIAL:6]' 归还,
15000 'BF[SERIAL:6]' 报废, 15200 'DS[SERIAL:6]' 丢失 ...
```

实测 `fs_bill.BILL_NO`：`JY10000001, HB10000001, RK10000001, TG10000002` = 前缀 + 6 位序号。

`jp_sequence 70` 行 `(SEQNAME, CID, NEXTVAL, TABLELIST, REMARK)`：

```text
'FS_BILL.BID' NEXTVAL 10000164
'FS_BILL.NO_1400' NEXTVAL 10000003     # 领用序号（后缀约等于 SID 简写）
'FS_BOM.BOMID' NEXTVAL 10001408
'AS_BILL.BID' NEXTVAL 95
'CS_BOM.BOMID' NEXTVAL 22
```

- `SEQNAME` 固定 `表.字段` 或 `表.字段_动作码`，`NEXTVAL` 单独存，不依赖 `AUTO_INCREMENT`，可跨表、不回退、多前缀共用一个 `BID` 池。
- `BID/BOMID` 起始 `10000001`（8 位）与早期小数字测试数据错开；`AS/CS` 还是 `95/22` 说明那两个域只是演示数据。

`BMID` 方法字典 `(BMID, SID, METHOD_CODE, METHOD_NAME)` 挂在状态下，`METHOD_CODE` 固定 `01/02/99`（`99=其他`）：

```text
SID=10100: 01 采购入库, 02 自建转固, 03 赠送入库, 99 其他方式
SID=10400: 01 新人领用, 02 日常领用
SID=10410: 01 出差借用, 02 客户借用
```

---

## 8. 子表主键：`PID × 10(+n)` 预留序号位

- `jp_page_editor (PEID, PID)`：`110000←11000, 120000←12000, 100002000←10000200`，即 `PEID = PID×10` 再加序号。
- `jp_page_grid.PGID / jp_page_search.PSID` 备注 `PIDx100`，低位留给 `IDX`。
- `jp_page_editor_items / jp_page_search_items` 三级排序 `ORDER BY GROUP_IDX, ROW_IDX, IDX`，配合 `REQUIRED / POWER / MODE_WITHOUT` 做权限化表单。

本质：加字段不改表结构，加行即可，是低代码核心。

---

## 9. 字段命名：前后缀即类型系统

- 主键全大写 ID，注释必写来源：`BOMID/BID/BLID/CSID/NID/CID/DID/WHID/WCID/UID/RID/MID/SID/PID/PFID`。
- 父键一律 `P_`：`P_CSID / P_CTID / P_MID / P_SID / P_RID / P_WHID / P_CID / P_DID`。
- 编码 / 名称成对：`CLASS_CODE/CLASS_NAME, CO_CODE/CO_NAME, METHOD_CODE/METHOD_NAME, BILL_NO/BILL_DATE`。
- 金额时间：`BUY_PRICE/BUY_DATE/START_DATE, HTJE/HTQSR/HTDQR, JQRQ/DHGLRQ`。
- 归属四件套：`M_CID` 归属单位、`CID` 使用 / 代管单位、`CID_AC` 入账单位、`A_UID/M_UID` 保管员 / 客户经理，一行资产拆清物权、账、保管。
- 快照双份：`fs_bill_list` 全是 `O_xxx(原) / N_xxx(新)`，如 `O_STATE/O_CID... N_STATE/N_CID...`，审批即比较两份。
- 审计四件套收尾：`CREATE_USER / CREATE_DATE / EDIT_USER / EDIT_DATE + REMARK + STATE(0停用1启用)`，字典表几乎一样。
- 标志位 `smallint 0/1` 三套名字：`STATE` 启用、`LOWEST` 是否叶子、`DONT_CHK` 不盘点、`INC_STATUS/DEC_STATUS` 增减统计；`ACTIVE 0/1/256/512` 表流程线状态。

---

## 10. 可抄与要避

可抄：

1. `AUTOCODE` 定长分级码，字符串排序即树序。
2. `CO_LEVEL_PER` 与编码容量联动声明。
3. `SID` 语义状态码 + `Sxxx` 宽表流转矩阵。
4. `BILL_NO` 前缀 + `jp_sequence` 中央发号。
5. `O_/N_` 新旧快照。
6. `PID×N` 子表编码。
7. `GIDX/IDX` 与业务键分离排序。

要避：

1. 无外键，全靠应用保证。
2. `double` 存金额，该用 `decimal`。
3. `int(4)` 只是显示宽度，不是取值范围。
4. `CHARSET=utf8` 非 `utf8mb4`。
5. `STATE` 一词多义（启用 / 工单 256 终审 / 盘点状态混用）。
6. `fs_state` 宽表加一种动作就要 `ALTER` 加一列，适合读多写少，不适合频繁加流程。

> 一句话：用可读的数字编码代替外键和配置表，让实施人员靠“看号段”运维；代价是业务语义焊死在数字里，改号段等于改代码。
