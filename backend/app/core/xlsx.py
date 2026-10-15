"""零依赖 xlsx 生成器:单表导出,不引入 openpyxl(便于离线/国产化部署)."""
from decimal import Decimal
from zipfile import ZIP_DEFLATED, ZipFile
from io import BytesIO


def _col(n):
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


def _num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float, Decimal)):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f
    return None


def _cell(ref, value, style):
    n = _num(value)
    if n is not None:
        return '<c r="%s"%s><v>%s</v></c>' % (ref, style, repr(n))
    if value is None:
        return '<c r="%s"%s/>' % (ref, style)
    return ('<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s'
            '</t></is></c>' % (ref, style, _esc(value)))


_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="宋体"/></font>'
    '<font><b/><sz val="11"/><name val="宋体"/></font></fonts>'
    '<fills count="3"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F497D"/>'
    '<bgColor indexed="64"/></patternFill></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/>'
    '</border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
    '</cellStyleXfs>'
    '<cellXfs count="2">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"'
    ' applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/>'
    '</xf></cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/>'
    '</cellStyles></styleSheet>'
)


def build_xlsx(headers, rows, sheet_name="Sheet1"):
    """headers: list[str]; rows: list[list]; 返回 xlsx 字节流."""
    out = []
    hcells = "".join(_cell("%s1" % _col(i + 1), h, ' s="1"')
                     for i, h in enumerate(headers))
    out.append('<row r="1">%s</row>' % hcells)
    for ri, row in enumerate(rows, 2):
        cells = "".join(_cell("%s%d" % (_col(ci + 1), ri), v, "")
                        for ci, v in enumerate(row))
        out.append('<row r="%d">%s</row>' % (ri, cells))
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml'
             '/2006/main"><sheetData>%s</sheetData></worksheet>' % "".join(out))

    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/'
          'content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats'
          '-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.'
          'openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application'
          '/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.'
          'openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006'
            '/relationships"><Relationship Id="rId1" Type="http://schemas.'
            'openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
            ' Target="xl/workbook.xml"/></Relationships>')
    wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006'
          '/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006'
          '/relationships"><sheets><sheet name="%s" sheetId="1" r:id="rId1"/>'
          '</sheets></workbook>' % _esc(sheet_name)[:31])
    wbrels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Relationships xmlns="http://schemas.openxmlformats.org/package'
              '/2006/relationships"><Relationship Id="rId1" Type="http://schemas'
              '.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
              ' Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type='
              '"http://schemas.openxmlformats.org/officeDocument/2006/'
              'relationships/styles" Target="styles.xml"/></Relationships>')

    buf = BytesIO()
    with ZipFile(buf, "w", ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", wbrels)
        z.writestr("xl/styles.xml", _STYLES)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return buf.getvalue()
