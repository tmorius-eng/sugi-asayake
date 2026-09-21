# -*- coding: utf-8 -*-
"""Builds the handover reference manual PDF from api.json + hand-written prose.

Cyrillic: reportlab's built-in fonts have no Cyrillic glyphs, so the repo's own
bundled DejaVu TTFs are registered (server/assets/fonts, OFL-licensed).
"""
import io, json, os, re, html
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether)
from reportlab.platypus.tableofcontents import TableOfContents

# Репозиторын язгуур нь энэ скриптийн байрлалаас гарна (docs/manual/ -> ../..).
# Хатуу зам бичих нь өөр машин дээр (ажлын лаптоп, худалдан авагчийн компьютер)
# шууд унана — энэ бол хүлээлцэх багцын нэг хэсэг.
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
API = json.load(io.open(os.path.join(HERE, "api.json"), encoding="utf-8"))
OUTPDF = os.path.join(ROOT, "docs", "SUGI-ASAYAKE-HANDOVER-MANUAL.pdf")

F = os.path.join(ROOT, "server", "assets", "fonts")
pdfmetrics.registerFont(TTFont("Body", os.path.join(F, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("Bold", os.path.join(F, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Bold", italic="Body", boldItalic="Bold")

INK, MUTED, RULE, ACC, BG = colors.HexColor("#17181b"), colors.HexColor("#5a5f5c"), colors.HexColor("#c9d0ca"), colors.HexColor("#8a1425"), colors.HexColor("#f2f5f2")

def S(name, size=9.5, leading=13.5, font="Body", color=INK, space_before=0, space_after=4, left=0, keep=0):
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading, textColor=color,
                          spaceBefore=space_before, spaceAfter=space_after, leftIndent=left,
                          alignment=TA_LEFT, keepWithNext=keep, wordWrap="CJK")

ST = {
    "h1": S("h1", 19, 24, "Bold", INK, 4, 10, keep=1),
    "h2": S("h2", 13.5, 18, "Bold", INK, 14, 6, keep=1),
    "h3": S("h3", 11, 15, "Bold", ACC, 10, 4, keep=1),
    "p": S("p"),
    "small": S("small", 8.2, 11.5, "Body", MUTED),
    "code": S("code", 7.8, 10.5, "Body", colors.HexColor("#243046")),
    "li": S("li", 9.5, 13.5, left=10),
    "cell": S("cell", 8.2, 11, "Body", INK),
    "cellb": S("cellb", 8.2, 11, "Bold", INK),
    "cellm": S("cellm", 7.6, 10.2, "Body", MUTED),
}

# Бичвэрт кодоос орж ирсэн япон/хятад тэмдэгт байвал DejaVu-д глиф байхгүй тул
# хоосон хайрцаг болж хэвлэгддэг. Ийм хэдэн үг л байдаг (барааны япон нэр,
# орчуулгын жишээ) тул тэднийг тэмдэглээд орхино.
CJK = re.compile(r"[　-ヿ㐀-䶿一-鿿豈-﫿＀-￯]+")

def esc(t):
    return html.escape(CJK.sub("[япон]", str(t or "")), quote=False)

def P(t, s="p"):
    return Paragraph(esc(t), ST[s])

def RAW(t, s="p"):
    return Paragraph(t, ST[s])

story = []

class Doc(BaseDocTemplate):
    def __init__(self, *a, **k):
        BaseDocTemplate.__init__(self, *a, **k)
        frame = Frame(20 * mm, 18 * mm, A4[0] - 40 * mm, A4[1] - 38 * mm, id="n")
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self.deco)])
        self.seen = set()

    def deco(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Body", 7.5)
        canvas.setFillColor(MUTED)
        if doc.page > 1:
            canvas.drawString(20 * mm, A4[1] - 13 * mm, "SUGI ASAYAKE — Хүлээлцэх гарын авлага")
            canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 13 * mm, "2026-09-21")
            canvas.setStrokeColor(RULE)
            canvas.setLineWidth(0.4)
            canvas.line(20 * mm, A4[1] - 15 * mm, A4[0] - 20 * mm, A4[1] - 15 * mm)
            canvas.drawCentredString(A4[0] / 2, 11 * mm, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("h1", "h2"):
            txt = re.sub("<[^<]+?>", "", flowable.getPlainText())
            lvl = 0 if flowable.style.name == "h1" else 1
            self.notify("TOCEntry", (lvl, txt, self.page))

def H(text, level="h1", brk=False):
    if brk:
        story.append(PageBreak())
    story.append(Paragraph(esc(text), ST[level]))
    if level == "h1":
        story.append(Table([[""]], colWidths=[A4[0] - 40 * mm], rowHeights=[1.6],
                           style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACC)])))
        story.append(Spacer(1, 7))

def bullets(items, style="li"):
    for it in items:
        story.append(RAW("&bull;&nbsp; " + (it if "<" in it else esc(it)), style))

def table(rows, widths, head=True, font_head="cellb", zebra=True):
    data = []
    for i, r in enumerate(rows):
        data.append([c if hasattr(c, "wrap") else Paragraph(esc(c), ST[font_head if (head and i == 0) else "cell"]) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0, hAlign="LEFT")
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
          ("TOPPADDING", (0, 0), (-1, -1), 3.2),
          ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
          ("LEFTPADDING", (0, 0), (-1, -1), 4),
          ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    if head:
        st += [("BACKGROUND", (0, 0), (-1, 0), BG), ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK)]
    if zebra:
        for i in range(1 + (1 if head else 0), len(data), 2):
            st.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fafbfa")))
    t.setStyle(TableStyle(st))
    story.append(t)
    story.append(Spacer(1, 7))

def note(text, title="⚠"):
    inner = Table([[Paragraph("<b>" + esc(title) + "</b>&nbsp; " + esc(text), ST["cell"])]],
                  colWidths=[A4[0] - 40 * mm - 6])
    inner.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf6f2")),
                               ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0b9a6")),
                               ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                               ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(inner)
    story.append(Spacer(1, 7))

W = A4[0] - 40 * mm

# ==========================================================================
# COVER
# ==========================================================================
story.append(Spacer(1, 45 * mm))
story.append(Paragraph("SUGI ASAYAKE", ParagraphStyle("cv", fontName="Bold", fontSize=34, leading=38, textColor=INK)))
story.append(Paragraph("Онлайн худалдааны систем", ParagraphStyle("cv2", fontName="Body", fontSize=17, leading=22, textColor=MUTED, spaceBefore=4)))
story.append(Spacer(1, 12))
story.append(Table([[""]], colWidths=[62 * mm], rowHeights=[2.4], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACC)])))
story.append(Spacer(1, 16))
story.append(Paragraph("ХҮЛЭЭЛЦЭХ ГАРЫН АВЛАГА", ParagraphStyle("cv3", fontName="Bold", fontSize=15, leading=20, textColor=ACC)))
story.append(Spacer(1, 6))
story.append(Paragraph("Шинэ эзэмшигч болон түүний хөгжүүлэгчид зориулсан бүрэн лавлагаа:<br/>"
                       "системийн бүтэц, функц бүрийн тайлбар, өдөр тутмын ажиллагаа,<br/>"
                       "данс шилжүүлэх журам, нөөцлөлт, аюулгүй байдал.",
                       ParagraphStyle("cv4", fontName="Body", fontSize=10.5, leading=17, textColor=MUTED)))
story.append(Spacer(1, 30))
table([["Баримт", "Хүлээлцэх гарын авлага, хувилбар 1.0"],
       ["Огноо", "2026 оны 9 дүгээр сарын 21"],
       ["Хамрах хүрээ", "Эх код, өгөгдлийн сан, дэд бүтэц, үйл ажиллагаа"],
       ["Уншигч", "Худалдан авагч эзэмшигч · дэлгүүрийн ажилтан · хөгжүүлэгч"],
       ["Нууцлал", "Худалдааны хэлэлцээрийн нууц баримт"]],
      [38 * mm, W - 38 * mm], head=False, zebra=False)
story.append(PageBreak())

# ==========================================================================
# TOC
# ==========================================================================
story.append(Paragraph("Агуулга", ST["h1"]))
story.append(Table([[""]], colWidths=[W], rowHeights=[1.6], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACC)])))
story.append(Spacer(1, 8))
toc = TableOfContents()
toc.levelStyles = [S("t0", 10.5, 18, "Bold", INK, 5, 0), S("t1", 9, 15, "Body", MUTED, 0, 0, left=12)]
story.append(toc)

# ==========================================================================
# 0. HOW TO READ
# ==========================================================================
H("0. Энэ баримтыг хэрхэн унших вэ", "h1", brk=True)
story.append(P("Энэ гарын авлага гурван өөр хүнд зориулагдсан тул гурван хэсэгтэй. Танд хамаарах хэсгээс нь эхэл — бүхэлд нь дараалан унших шаардлагагүй."))
table([["Хэсэг", "Хэнд", "Юуны тухай"],
       ["I хэсэг (1–7)", "Эзэмшигч", "Юу худалдаж авч байна, ямар данс, ямар зардал, хэн юу хийдэг. Техникийн мэдлэг шаардахгүй."],
       ["II хэсэг (8–12)", "Дэлгүүрийн ажилтан", "/admin самбарын 25 хэсэг тус бүр, өдөр тутмын ажил, 64 тохиргоо."],
       ["III хэсэг (13–21)", "Хөгжүүлэгч", "Архитектур, файл бүр, функц бүр, API, өгөгдлийн сан, deploy, тест, дүрмүүд."]],
      [30 * mm, 30 * mm, W - 60 * mm])
note("Энэ баримт дахь бүх тоо, нэр, функцийн жагсаалт нь эх кодоос АВТОМАТААР гаргаж авсан "
     "бөгөөд 2026-09-21-ний байдлаарх бодит төлөв. Код өөрчлөгдөхөд энэ баримтыг дахин үүсгэнэ "
     "(III хэсгийн 21-р бүлгийг үз).", "Анхаар")

# ==========================================================================
# PART I — OWNER
# ==========================================================================
H("I ХЭСЭГ — ЭЗЭМШИГЧИД", "h1", brk=True)
H("1. Та юу худалдаж авч байна вэ", "h2")
story.append(P("SUGI ASAYAKE нь Улаанбаатар дахь жижиглэн худалдааны дэлгүүрт зориулж тусгайлан "
               "бүтээгдсэн, бүрэн ажиллагаатай онлайн худалдааны систем юм. Энэ бол бэлэн платформ "
               "(Shopify, Zochil) дээр суурилсан түрээсийн дэлгүүр БИШ — эх код бүхэлдээ, өгөгдлийн "
               "сан бүхэлдээ таны өмч болно. Сар бүрийн платформын төлбөр, борлуулалтын хувь байхгүй."))
story.append(Spacer(1, 3))
nums = [["Үзүүлэлт", "Тоо", "Тайлбар"],
        ["Бүтээгдэхүүн", "984", "Монгол нэр, зураг, ангилал, брэнд, баркодтойгоор бааз руу оруулсан"],
        ["Өгөгдлийн сангийн хүснэгт", str(len(API["tables"])), "Захиалга, нөөц, харилцагч, контент бүгд"],
        ["Өгөгдлийн сангийн хувилбар", str(len(API["migrations"])), "migration файл — схемийн бүрэн түүх"],
        ["Серверийн API цэг", str(sum(len(r["procs"]) for r in API["routers"])), "%d бүлэгт хуваагдсан" % len(API["routers"])],
        ["Серверийн функц", str(sum(len(v["fns"]) for v in API["files"].values())), "%d файлд" % len(API["files"])],
        ["Худалдан авагчийн хуудас", str(len(API["pages"])), "%d React компонент" % API["components"]],
        ["Удирдлагын самбарын хэсэг", str(len(API["admin_sections"])), "5 эрхийн түвшинтэй"],
        ["Админаас засварлах тохиргоо", "64", "Код өөрчлөхгүйгээр солигдоно"],
        ["Автомат тест", "1094 + 156", "vitest нэгж/интеграц + Playwright бодит хөтөч (компьютер+утас)"],
        ["Хэл", "3", "Монгол · English · Япон"]]
table(nums, [46 * mm, 20 * mm, W - 66 * mm])

H("1.1 Хурд ба чанар — бодитоор хэмжсэн", "h3")
story.append(P("Дараах тоонууд нь Google-ийн Lighthouse хэрэгслээр 2026-09-21-нд АМЬД сайт "
               "дээр хэмжсэн бодит үр дүн (утасны хэмжилт нь удаан сүлжээ, сул процессорыг "
               "дуурайдаг тул зориуд хатуу нөхцөл)."))
table([["Хуудас", "Гүйцэтгэл", "Хүртээмж", "SEO", "Хамгийн том зураг"],
       ["Нүүр (компьютер)", "94 / 100", "93", "100", "1.5 секунд"],
       ["Нүүр (утас)", "59 / 100", "93", "100", "6.9 секунд"],
       ["Дэлгүүр (утас)", "74 / 100", "87", "92", "5.2 секунд"],
       ["Барааны хуудас (утас)", "75 / 100", "93", "100", "4.8 секунд"]],
      [46 * mm, 26 * mm, 24 * mm, 18 * mm, W - 114 * mm])
note("Дээрх нь засвараас ӨМНӨХ production-ий хэмжилт. Мөн өдөр хийсэн засварын дараа "
     "(утас, ижил компьютер дээрх Lighthouse-ийн медиан): оноо 54 -> 77, хамгийн том зураг "
     "9.8 -> 4.2 секунд, нүүр хуудасны зураг 6.3 MB -> 1.1 MB. Дизайн өөрчлөгдөөгүй — "
     "зөвхөн файлын хэмжээ, формат (WebP/AVIF), ачаалах дараалал. Google-ийн зорилт 2.5 секунд "
     "хэвээр хүрэгдээгүй; үлдсэн хугацаа нь зургийн хэмжээ биш, хуудасны JavaScript "
     "ачаалж дуусах хугацаа (6-р бүлэг).", "Ил тод")

H("1.2 Худалдан авагчид юу харагддаг вэ", "h3")
bullets([
    "Каталог: хайлт (буруу бичсэн ч олдоно, кирилл/латин хоёуланд), ангилал, брэнд, үнэ, арьсны төрлөөр шүүх",
    "Барааны хуудас: зураг галерей, хувилбар (хэмжээ/өнгө), нөөцийн төлөв, найрлага, сэтгэгдэл, асуулт-хариулт, санал болгосон бараа",
    "Сагс, захиалга: бүртгэлгүйгээр (зочноор) захиалах, хүргэлт эсвэл салбараас авах, хямдралын код, дэлгүүрийн зээл, бэлгийн карт",
    "Төлбөр: бэлэн мөнгө · QPay · StorePay (сүүлийн хоёр нь merchant гэрээ ормогц асна)",
    "Хувийн бүртгэл: захиалгын түүх, PDF баримт, хаягийн дэвтэр, хүслийн жагсаалт, арьсны асуулга дээр тулгуурласан хувийн санал, мэдэгдлийн тохиргоо, бүртгэлээ устгах",
    "Утсанд апп болгон суулгах (PWA), утасны мэдэгдэл, харанхуй горим, күүкийн зөвшөөрөл",
])

H("1.3 Дэлгүүрт юу байдаг вэ", "h3")
bullets([
    "Захиалгын бүрэн урсгал: хүлээгдэж буй → баталгаажсан → бэлтгэсэн → хүргэлтэд → дууссан, цуцлал ба буцаан олголт нөөцтэйгөө хамт",
    "Нөөцийн бүртгэл: 4 салбар + агуулах тус бүрээр, USB сканнераар хүлээн авах, тооллого, салбар хоорондын шилжүүлэг, хөдөлгөөн бүр бүртгэгддэг",
    "Аналитик: борлуулалт, ашиг, маржин, сагс орхилт, хөрвүүлэлт, дүүрэг, Excel/PDF тайлан",
    "Контент: нүүр хуудасны зураг/текст, нийтлэл, брэнд, урамшуулал, хуулийн 3 баримт — бүгд 3 хэлээр",
    "Утасны мэдэгдэл: шинэ захиалга, төлбөр, нөөц дуусах — ажилтны утсанд шууд",
    "Аюулгүй байдал: 5 эрхийн түвшин, царай таних хаалга, үйлдлийн бүртгэл (audit log)",
])

H("2. Таны хүлээж авах данс, үйлчилгээ", "h2", brk=False)
story.append(P("Систем нь дараах гадаад үйлчилгээн дээр ажилладаг. Худалдааны гэрээ байгуулахдаа эдгээр "
               "данс тус бүрийг ШИЛЖҮҮЛЭХ эсвэл ШИНЭЭР байгуулахаа тодорхой болго. Багана бүр: "
               "юунд хэрэгтэй, хаана тохируулагддаг, байхгүй бол юу зогсох."))
svc = [["Үйлчилгээ", "Юунд", "Хаана тохируулагддаг", "Байхгүй бол"],
       ["Oracle Cloud (Токио)", "Сервер (VM) ба өгөгдлийн сан (MySQL HeatWave)", ".env + Oracle консол", "Сайт бүхэлдээ зогсоно"],
       ["Cloudflare", "Домэйн/DNS, зургийн сан (R2), хамгаалалт (WAF), tunnel", ".env + Cloudflare консол", "Сайт хүрэхгүй, зураг алга болно"],
       ["Brevo", "Захиалгын имэйл ба SMS", ".env", "Имэйл илгээгдэхгүй (лог руу бичнэ)"],
       ["verify.mn", "Зочны утасны SMS баталгаажуулалт", ".env", "Зочны захиалга баталгаажихгүй (алдаа шиднэ)"],
       ["QPay", "Онлайн төлбөр (QR)", ".env", "QPay сонголт харагдахгүй"],
       ["StorePay", "Хэсэгчилсэн төлбөр", "/admin → Интеграцууд", "StorePay сонголт харагдахгүй"],
       ["ntfy", "Ажилтны утасны мэдэгдэл", "/admin → Интеграцууд", "Мэдэгдэл дараалалд хуримтлагдана"],
       ["Smart Software", "Кассын систем, вендорын үлдэгдэл", "/admin → Интеграцууд", "Үлдэгдэл автоматаар татагдахгүй"],
       ["Honeybadger", "Алдааны хяналт", ".env", "Алдаа чимээгүй өнгөрнө"],
       ["Meta (Facebook)", "Facebook-ээр нэвтрэх, Pixel хэмжилт", ".env + /admin → Хэмжилт", "Тухайн товч/хэмжилт унтарна"],
       ["Google", "Analytics 4, Search Console, Merchant feed", "/admin → Хэмжилт", "Хэмжилт цуглуулахгүй"],
       ["GitHub", "Эх кодын хадгалалт, автомат тест, uptime шалгалт", "GitHub данс", "Код хувилбарын түүх, CI зогсоно"],
       ["Anthropic (сонголттой)", "Сэтгэгдлийн AI шүүлт", ".env", "Монгол үгийн шүүлт хэвээр ажиллана"]]
table(svc, [30 * mm, 38 * mm, 40 * mm, W - 108 * mm])

H("3. Сэргээх БОЛОМЖГҮЙ гурван нууц", "h2")
note("Дараах гурван утгыг алдвал ХЭН Ч сэргээж чадахгүй. Хүлээлцэх өдөр эдгээрийг нууц үгийн "
     "менежерт (1Password, Bitwarden гэх мэт) хийж, хоёр хүн тусад нь хуулбартай болох ёстой.", "ЗААВАЛ")
table([["Нууц", "Алдвал юу болох", "Хаана байдаг"],
       ["INTEGRATIONS_ENCRYPTION_KEY", "/admin-д оруулсан БҮХ интеграцын нууц (ntfy, StorePay, Smart Software) уншигдахгүй болно — бүгдийг дахин гараар оруулна", "Серверийн .env файл"],
       ["BACKUP_PASSPHRASE", "Өдөр бүрийн шифрлэгдсэн нөөц хуулбар бүгд ҮҮРД нээгдэхгүй болно", "Серверийн .env файл"],
       ["JWT_SECRET", "Нэвтэрсэн бүх хэрэглэгч гарна (сэргээгдэх боловч бүгд дахин нэвтэрнэ)", "Серверийн .env файл"]],
      [46 * mm, W - 92 * mm, 46 * mm])
story.append(P("Дээрээс гадна серверт холбогдох SSH түлхүүр нь deploy, өгөгдлийн сан, нөөцлөлт "
               "гурвуулангийн цорын ганц хаалга юм. Хоёр лаптоп хоёулаа алдагдвал зөвхөн Oracle "
               "консолоор дамжин шинэ түлхүүр нэмж болно — тиймээс Oracle дансны нэвтрэх эрх нь "
               "SSH түлхүүрээс ч чухал.", "p"))

H("4. Сар бүрийн зардал ба хариуцлага", "h2")
story.append(P("Доорх зардлууд эзэмшигчийн данс дээр гарна. Тоон утга нь тухайн үеийн багцаас "
               "хамаарах тул гэрээ байгуулахын өмнө өөрийн консолоос баталгаажуул."))
table([["Зүйл", "Төлбөрийн шинж"],
       ["Oracle Cloud VM + MySQL HeatWave", "Always Free багц дээр эхэлсэн; ачаалал өсвөл төлбөртэй болно"],
       ["Cloudflare DNS + R2 зургийн сан", "R2 нь хадгалсан хэмжээ ба гаргалтаас хамаарна"],
       ["Домэйн", "Жилийн шинэчлэл"],
       ["Brevo имэйл/SMS", "Үнэгүй хязгаар + SMS кредит"],
       ["verify.mn", "Мессеж тутамд"],
       ["QPay / StorePay", "Гүйлгээний хувь (merchant гэрээгээр)"],
       ["Honeybadger, ntfy, GitHub", "Үнэгүй багцад багтаж байгаа"]],
      [62 * mm, W - 62 * mm])

H("5. Өдөр тутмын ажиллагаа — хэн юуг хэзээ", "h2")
story.append(P("Худалдан авагч байгууллага системийг хөгжүүлэгчгүйгээр ажиллуулж чадах эсэхийг "
               "шалгах хамгийн сайн арга бол доорх хуваарийг нэг сар дагаж үзэх явдал."))
table([["Давтамж", "Ажил", "Хэн"],
       ["Өдөр бүр", "Шинэ захиалгыг боловсруулах (баталгаажуулах → бэлтгэх → хүргэх)", "Дэлгүүрийн ажилтан"],
       ["Өдөр бүр", "Сэтгэгдэл, асуултад хариулах", "Маркетинг"],
       ["Өдөр бүр (автомат)", "Өгөгдлийн сангийн шифрлэгдсэн нөөц хуулбар үүснэ", "Систем"],
       ["Долоо хоног бүр", "Нөөцийн зөрүү шалгах (Хянах самбар → Системийн байдал)", "Агуулах"],
       ["Долоо хоног бүр", "Хайлтын статистик: юу хайгаад олдоогүйг үзэж синоним нэмэх", "Маркетинг"],
       ["Долоо хоног бүр (автомат)", "Хөтөлбөрийн шинэчлэлт/эмзэг байдлын шалгалт", "Систем"],
       ["Сар бүр", "Нөөц хуулбараас сэргээх дасгал хийх", "Хөгжүүлэгч"],
       ["Сар бүр", "Борлуулалтын тайлан татах (Excel/PDF)", "Санхүү"],
       ["Шаардлагатай үед", "Шинэ бараа нэмэх, үнэ шинэчлэх, урамшуулал зарлах", "Маркетинг/агуулах"]],
      [32 * mm, W - 62 * mm, 30 * mm])

H("6. Мэдэгдэж буй хязгаарлалт (ил тод)", "h2")
story.append(P("Дараах зүйлс ОДООГООР дуусаагүй. Аль нь ч системийн ажиллагааг зогсоохгүй, "
               "гэхдээ худалдан авагч урьдчилан мэдэх ёстой."))
lim = [["Асуудал", "Байдал", "Юу хийх шаардлагатай"],
       ["QPay, StorePay төлбөр", "Код бүрэн бэлэн, туршигдаагүй", "Merchant гэрээ байгуулж түлхүүр оруулах"],
       ["eBarimt (НӨАТ)", "Зөвхөн схем бэлэн", "Татварын нэгдсэн системтэй холбох ажил"],
       ["Барааны зураг", "415 бараа зураггүй", "Дэлгүүрээс биечлэн зураг авах"],
       ["Брэндийн лого", "9-өөс 1 нь л орсон", "/admin → Брэнд дээр 8 лого нэмэх"],
       ["Серверийн санах ой", "2 CPU / 954 MB — AI загвар ачаалахад хязгаарт ойртоно", "RAM нэмэх эсвэл AI шүүлтийг унтраах"],
       ["Uptime мониторинг", "Cloudflare-ийн бот хамгаалалт шалгагчийг хааж байна", "Дүрэм гаргах эсвэл өөр мониторинг руу шилжих"],
       ["Ачааллын тест", "k6 скрипт бэлэн, ажиллуулаагүй", "Staging дээр тасрах цэгийг хэмжих"],
       ["Хуулийн баримт", "Хуульчаар шалгуулаагүй", "Монголын хуульчаар нэг удаа хянуулах"]]
table(lim, [42 * mm, 44 * mm, W - 86 * mm])

H("7. Лиценз ба оюуны өмч", "h2")
note("Энэ хэсгийг худалдааны гэрээнд заавал тусга. Эх код бол таны өмч болох боловч дотор нь "
     "гуравдагч талын бүрэлдэхүүн хэсгүүд байгаа бөгөөд тэдгээр нь өөрийн гэсэн нөхцөлтэй.", "Хуулийн анхааруулга")
table([["Бүрэлдэхүүн", "Нөхцөл", "Таны хийх зүйл"],
       ["Эх код", "package.json дээр UNLICENSED (хувийн өмч) гэж тэмдэглэгдсэн", "Гэрээнд онцгой эрхийг тодорхой бич"],
       ["TinyMCE (текст засварлагч)", "GPL хувилбараар ашиглаж байна", "Хаалттай эх кодтой болгох бол худалдааны лиценз ав"],
       ["Golos Text, DejaVu (шрифт)", "Нээлттэй лиценз (OFL) — асуудалгүй", "Юу ч хийх шаардлагагүй"],
       ["Барааны зураг", "Ихэнх нь үйлдвэрлэгчийн лого/зураг", "Брэндүүдээс ашиглах зөвшөөрөл авах"],
       ["Бусад сан (React гэх мэт)", "MIT/нээлттэй лиценз", "Юу ч хийх шаардлагагүй"]],
      [42 * mm, W - 88 * mm, 46 * mm])

H("7.1 Хүлээлцэх акт — шалгах хуудас", "h3")
story.append(P("Дараах бүх мөр гүйцэтгэгдэж, хоёр тал гарын үсэг зурснаар хүлээлцэлт дууссанд тооцно."))
checks = ["Oracle Cloud дансны эрх шилжсэн (эсвэл шинэ данс байгуулж өгөгдөл нүүсэн)",
          "Cloudflare данс, домэйн, R2 зургийн сан шилжсэн",
          "Brevo, verify.mn, QPay, StorePay, ntfy, Honeybadger дансны эрх шилжсэн",
          "GitHub репозитор шилжсэн, хуучин эзний эрх хаагдсан",
          "Гурван сэргээгдэхгүй нууц нууц үгийн менежерт хадгалагдсан",
          "Серверийн SSH түлхүүр шинэ эзний машин дээр ажиллаж байгааг шалгасан",
          "Нөөц хуулбараас сэргээх дасгалыг шинэ эзний өмнө нэг удаа хийсэн",
          "Шинэ эзний хүн /admin-д нэвтэрч, туршилтын захиалга үүсгэж, цуцалж үзсэн",
          "Энэ гарын авлага болон бичлэгтэй заавар хүлээлгэн өгсөн",
          "Хуучин эзний бүх admin эрх, төхөөрөмжийн session хаагдсан"]
rows = [[Paragraph("☐", ST["cell"]), Paragraph(esc(c), ST["cell"])] for c in checks]
table([[Paragraph("", ST["cellb"]), Paragraph("Шалгах зүйл", ST["cellb"])]] + rows, [10 * mm, W - 10 * mm])

# ==========================================================================
# PART II — STAFF
# ==========================================================================
H("II ХЭСЭГ — ДЭЛГҮҮРИЙН АЖИЛТАНД", "h1", brk=True)
H("8. Удирдлагын самбарын 25 хэсэг", "h2")
story.append(P("/admin хаягаар нэвтэрнэ. Хэсэг бүрийн дээд талд яг доорх тайлбар гарч ирдэг тул "
               "энэ хүснэгтийг цээжлэх шаардлагагүй — систем өөрөө сануулна. Эрхийн түвшнээс "
               "хамаарч хүн бүр зөвхөн өөрт хэрэгтэй хэсгийг л харна."))
order = [k for k, _ in API["admin_sections"]]
labels = dict(API["admin_sections"])
rows = [["Хэсэг", "Энэ дэлгэц юунд зориулагдсан бэ"]]
for k in order:
    rows.append([labels.get(k, k), API["tips"].get(k, "—")])
table(rows, [36 * mm, W - 36 * mm])

H("9. Захиалга ирэхэд — үндсэн урсгал", "h2")
story.append(P("Шинэ онлайн захиалга орох бүрт ажилтны утсанд мэдэгдэл ирнэ. Дараах дараалал бол "
               "өдөр тутмын гол ажил юм."))
bullets(["<b>Захиалга</b> хэсэг → шинэ мөр «Хүлээгдэж байна» төлөвтэй гарч ирнэ.",
         "Мөрийг нээж бараа, тоо, хүргэлтийн хэлбэр, төлбөрийн аргыг харна.",
         "Харилцагчтай утсаар/мессежээр баталгаажуулаад → <b>Баталгаажсан</b>.",
         "Бараа бэлдээд → <b>Бэлтгэсэн</b>, хүргэлтэд гармагц → <b>Хүргэлтэд гарсан</b>.",
         "Хүргэгдсэн/авсны дараа → <b>Дууссан</b>. Бэлнээр төлсөн бол энэ үед төлбөр «төлөгдсөн» болно.",
         "Төлөв солих бүрт харилцагчид мэдэгдэл (утас + имэйл) АВТОМАТААР очно."])
note("Нөөцийг «Бүтээгдэхүүн» хэсгээс гараар засаж БОЛОХГҮЙ. Зөвхөн «Бараа хүлээн авах» "
     "(хүлээн авалт / тооллого) замаар өөрчил — эс бөгөөс нөөцийн хөдөлгөөний бүртгэлд зөрүү гарна.")

H("10. Админаас засварлах 64 тохиргоо", "h2")
story.append(P("Дараах утгууд бүгд /admin дотроос солигддог — код өөрчлөх, программист дуудах "
               "шаардлагагүй. Талбар бүрийн доор монгол тайлбар байдаг. Хоосон орхивол системийн "
               "анхдагч утга хэвээр ажиллана."))
groups = {}
for s in API["settings"]:
    groups.setdefault(s["group"], []).append(s)
for g, items in groups.items():
    story.append(Paragraph(esc(g) + "  (%d)" % len(items), ST["h3"]))
    rows = [["Тохиргоо", "Юунд нөлөөлөх"]]
    for s in items:
        rows.append([s["label"] or s["key"], s["desc"] or "—"])
    table(rows, [52 * mm, W - 52 * mm])

H("11. Юу хийж БОЛОХГҮЙ вэ", "h2")
bullets(["Бодит систем дээр «туршиж үзье» гэж захиалга/бараа үүсгээд орхихгүй — үүсгэсэн бол цуцал, устга.",
         "Нууц үг, API түлхүүр, ntfy token-ийг чат, мессежээр илгээхгүй.",
         "Нөөцийг бүтээгдэхүүний хэсгээс гараар засахгүй.",
         "Хуулийн баримтыг (нууцлал, нөхцөл, буцаалт) засахдаа хуулийн утгыг хэвээр үлдээ; эргэлзвэл «Анхны хувилбар руу буцаах» товч бий.",
         "Барааг устгахын оронд «нийтлэх» тэмдэглэгээг нь авч нуу — захиалгын түүх эвдэрнэ.",
         "Монгол текстийг засахдаа англи, япон хувилбарыг нь мартаж болохгүй (хэл бүр тусдаа)."])

H("12. Асуудал гарвал", "h2")
table([["Шинж тэмдэг", "Эхлээд юу шалгах"],
       ["Сайт нээгдэхгүй", "Админы утсанд «DOWN» мэдэгдэл ирсэн эсэх; серверийн эрүүл мэндийн хаягийг шалга; хөгжүүлэгчид мэдэгд"],
       ["Захиалга ирсэн ч мэдэгдэл ирэхгүй", "/admin → Интеграцууд → ntfy → «Туршилт» дар; утсан дээрх апп сэдэвт бүртгэлтэй эсэхийг шалга"],
       ["Зураг харагдахгүй", "Cloudflare R2 дансны төлөв, /admin → Content & Media дээр зураг байгаа эсэх"],
       ["Имэйл очихгүй", "Brevo дансны кредит, .env доторх түлхүүр"],
       ["Царай таних ажиллахгүй", "Зөвхөн https хаягаар ажиллана; өөр хөтөч/утас туршина; админ эрхтэй хүн бүртгэлийг дахин нээж өгнө"],
       ["Нөөц зөрүүтэй", "Хянах самбар → Системийн байдал → нөөцийн хөдөлгөөний бүртгэл улаан эсэх"]],
      [46 * mm, W - 46 * mm])

# ==========================================================================
# PART III — DEVELOPER
# ==========================================================================
H("III ХЭСЭГ — ХӨГЖҮҮЛЭГЧИД", "h1", brk=True)
H("13. Архитектур — хүсэлт хаанаас хаашаа урсдаг вэ", "h2")
story.append(P("Систем бол нэг Node.js процесс дээр ажилладаг монолит юм. Тусдаа backend/frontend "
               "сервер байхгүй: Express нь React-ийн бүтээгдсэн файлуудыг өгөөд, мөн API-г нь "
               "үйлчилдэг. Энэ нь deploy-г нэг команд болгож, орчны зөрүүг арилгадаг."))
flow = [["Алхам", "Юу болдог", "Хаана"],
        ["1", "Хөтөч хуудас хүснэ", "client/index.html"],
        ["2", "Сервер HTML дотор SEO мета, лого, нүүрний зургийг шингээж өгнө", "server/_core/indexHtml.ts"],
        ["3", "React апп ачаалж, хаягаас хамаарч хуудсаа сонгоно", "client/src/App.tsx"],
        ["4", "Хуудас өгөгдөл хүсэхдээ tRPC дуудлага хийнэ (төрөл нь хоёр талдаа ижил)", "client/src/lib/trpc.ts"],
        ["5", "Сервер дуудлагыг хүлээж авч эрхийг шалгана (procedure guard)", "server/_core/trpc.ts"],
        ["6", "Бизнес логик ажиллана", "server/routers.ts + server/*.ts"],
        ["7", "Өгөгдлийн сан руу Drizzle ORM-оор хандана (SQL гараар бичихгүй)", "server/db.ts"],
        ["8", "Хариу буцаж, React дэлгэцээ шинэчилнэ", "TanStack Query"]]
table(flow, [12 * mm, W - 72 * mm, 60 * mm])

H("13.1 Технологи", "h3")
table([["Давхарга", "Технологи"],
       ["Интерфейс", "React 18, TypeScript, Vite, Tailwind CSS, Radix UI, wouter (хаяг)"],
       ["API", "tRPC (төрөл хуваалцсан), TanStack Query"],
       ["Сервер", "Node.js, Express, pm2 (процессын менежер)"],
       ["Өгөгдлийн сан", "MySQL 8 (Oracle HeatWave), Drizzle ORM"],
       ["Файл хадгалалт", "Cloudflare R2 (S3-тэй нийцтэй)"],
       ["Тест", "vitest (нэгж + интеграц), Playwright (бодит хөтөч)"],
       ["Бүтээх", "pnpm, esbuild"]],
      [32 * mm, W - 32 * mm])

H("14. Хавтасны бүтэц", "h2")
table([["Хавтас", "Агуулга"],
       ["client/", "React интерфейс: pages/ (хуудас), components/ (компонент), hooks/, lib/"],
       ["server/", "Express сервер, tRPC router, бизнес логик, өгөгдлийн сангийн давхарга"],
       ["server/_core/", "Дэд бүтцийн модулиуд: орчин, аюулгүй байдал, кэш, имэйл, зураг боловсруулалт"],
       ["shared/", "Сервер ба клиент ХОЁУЛАА ашигладаг код: төрөл, тооцоо, орчуулга, тохиргооны бүртгэл"],
       ["drizzle/", "Өгөгдлийн сангийн схем ба %d migration файл" % len(API["migrations"])],
       ["scripts/", "Туслах скриптүүд: нөөцлөлт, deploy, өгөгдөл импорт, шалгалт (%d файл)" % len(API["scripts"])],
       ["e2e/", "Playwright тест — бодит хөтөч дээр хэрэглэгчийн урсгал (%d файл)" % len(API["e2e"])],
       ["docs/", "Баримт бичиг: энэ гарын авлага, аудит, архитектур"]],
      [30 * mm, W - 30 * mm])

# ---- 15. API reference ----
H("15. Серверийн API — бүрэн жагсаалт", "h2", brk=True)
story.append(P("Клиент серверт зөвхөн tRPC procedure-ээр хандана. Procedure бүр өөрийн ЭРХИЙН "
               "ХАМГААЛАЛТТАЙ: ямар түвшний хэрэглэгч дуудаж болохыг нэр нь шууд хэлнэ. Доорх "
               "жагсаалт нь эх кодоос автоматаар гаргасан бүрэн жагсаалт."))
table([["Хамгаалалт", "Хэн дуудаж болох"],
       ["publicProcedure", "Хэн ч (нэвтрээгүй зочин)"],
       ["protectedProcedure", "Нэвтэрсэн хэрэглэгч"],
       ["adminProcedure", "Зөвхөн админ (царайны баталгаа шаардана)"],
       ["financeProcedure", "Санхүү ба админ"],
       ["marketingProcedure", "Маркетинг ба админ"],
       ["warehouseProcedure", "Агуулах ба админ"],
       ["staffProcedure", "Дурын ажилтан"],
       ["strictRateLimited…", "Дээрхтэй ижил, нэмээд давтамжийн хатуу хязгаартай (нэвтрэлт, төлбөр)"]],
      [44 * mm, W - 44 * mm])
for r in API["routers"]:
    story.append(Paragraph(esc(r["name"]) + "  —  %d procedure" % len(r["procs"]), ST["h3"]))
    rows = [["Дуудлага", "Төрөл", "Эрх"]]
    for p in r["procs"]:
        rows.append(["%s.%s" % (r["name"], p["name"]), p["kind"], p["guard"]])
    table(rows, [W - 78 * mm, 24 * mm, 54 * mm])

# ---- 16. module + function reference ----
H("16. Модуль ба функц бүрийн лавлагаа", "h2", brk=True)
story.append(P("Энэ бол системийн ЦӨМ хэсэг: сервер ба хуваалцсан кодын файл бүр, түүний "
               "зорилго, дотроо экспортолж буй функц бүр. Тайлбар нь эх код доторх "
               "комментоос шууд авагдсан — өөрөөр хэлбэл кодыг бичсэн хүний өөрийнх нь "
               "тайлбар, дараа нь зохиосон зүйл биш."))
story.append(P("Нийт %d файл, %d экспортолсон функц." % (len(API["files"]), sum(len(v["fns"]) for v in API["files"].values())), "small"))
story.append(Spacer(1, 4))

def clip(text, n=250):
    """Cut on a sentence, then a word boundary -- never mid-word."""
    t = " ".join(str(text).split())
    if len(t) <= n:
        return t
    cut = t[:n]
    for stop in (". ", "; ", " -- "):
        i = cut.rfind(stop)
        if i > n * 0.5:
            return cut[:i + 1].strip()
    i = cut.rfind(" ")
    return (cut[:i] if i > 0 else cut).rstrip(",;:") + "..."

def describe(fn):
    """The author's own comment; failing that, the real signature from the code."""
    if fn["doc"]:
        return clip(fn["doc"])
    sig = re.sub(r'^export (async )?(function |const )', '', fn["sig"]).strip()
    return clip(sig, 200) if sig else "-"

def group_of(path):
    if path.startswith("server/_core/"):
        return "server/_core — дэд бүтцийн модулиуд"
    if path.startswith("server/search/"):
        return "server/search — хайлтын хөдөлгүүр"
    if path.startswith("server/"):
        return "server — бизнес логик"
    return "shared — сервер ба клиент хуваалцсан код"

ordered = sorted(API["files"].items(), key=lambda kv: (group_of(kv[0]), kv[0]))
last_group = None
for path, info in ordered:
    g = group_of(path)
    if g != last_group:
        story.append(Paragraph(esc(g), ST["h3"]))
        last_group = g
    head = [Paragraph("<b>%s</b>  <font size=7 color='#5a5f5c'>(%d мөр, %d функц)</font>" % (esc(path), info["loc"], len(info["fns"])), ST["cell"])]
    block = [Table([head], colWidths=[W], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG), ("LINEBELOW", (0, 0), (-1, -1), 0.6, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5)]))]
    if info["purpose"]:
        block.append(Spacer(1, 2))
        block.append(Paragraph(esc(info["purpose"][:520]), ST["cellm"]))
    story.append(KeepTogether(block))
    story.append(Spacer(1, 3))
    if info["fns"]:
        rows = [["Функц", "Юу хийдэг"]]
        for fn in info["fns"]:
            rows.append([fn["name"] + "()", describe(fn)])
        table(rows, [52 * mm, W - 52 * mm])
    else:
        story.append(Paragraph("Экспортолсон функцгүй (зөвхөн тогтмол/төрөл).", ST["cellm"]))
        story.append(Spacer(1, 6))

# ---- 17. database ----
H("17. Өгөгдлийн сан", "h2", brk=True)
story.append(P("MySQL 8 (Oracle HeatWave, Токио). Нийт %d хүснэгт, %d migration файл. Схемийн "
               "тодорхойлолт нь drizzle/schema.ts дотор TypeScript-ээр бичигдсэн тул хүснэгтийн "
               "бүтэц ба кодын төрөл хоёр хэзээ ч зөрөхгүй." % (len(API["tables"]), len(API["migrations"]))))
H("17.1 Хүснэгтүүд", "h3")
tb = API["tables"]
cols = 4
rows = []
for i in range(0, len(tb), cols):
    chunk = list(tb[i:i + cols]) + [""] * (cols - len(tb[i:i + cols]))
    rows.append(chunk)
table(rows, [W / cols] * cols, head=False)
H("17.2 Migration ажиллуулах", "h3")
note("Энэ төсөлд migration нь АВТОМАТААР ажилладаггүй. Deploy хийхэд зөвхөн код зөөгдөнө. "
     "Шинэ .sql файл бүрийг ГАРААР, production ба staging хоёуланд нь ажиллуулна — эс бөгөөс "
     "staging чимээгүйхэн 500 алдаа өгнө.")
story.append(RAW("<font face='Body' size='8'>pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_name.sql<br/>"
                 "pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_name.sql --staging</font>", "code"))
story.append(Spacer(1, 6))

# ---- 18. env ----
H("18. Орчны хувьсагчид", "h2")
story.append(P("Сервер .env файлаас тохиргоогоо уншина. Эх кодод олдсон бүх хувьсагч (%d) доор "
               "жагсаав. Энэ файлыг ХЭЗЭЭ Ч git рүү оруулахгүй." % len(API["env"])))
ev = API["env"]
cols = 3
rows = []
for i in range(0, len(ev), cols):
    chunk = list(ev[i:i + cols]) + [""] * (cols - len(ev[i:i + cols]))
    rows.append(chunk)
table(rows, [W / cols] * cols, head=False)
note("Заавал шаардлагатай: DATABASE_URL, JWT_SECRET, S3_* (зургийн сан), "
     "INTEGRATIONS_ENCRYPTION_KEY. Бусад нь байхгүй бол тухайн боломж чимээгүй унтарна — "
     "ганц үл хамаарах зүйл нь VERIFY_MN_API_KEY бөгөөд дуудагдмагц шууд алдаа шиднэ.")

# ---- 19. deploy / ops ----
H("19. Deploy, нөөцлөлт, мониторинг", "h2", brk=True)
H("19.1 Deploy", "h3")
story.append(P("Deploy нь хөгжүүлэгчийн Windows компьютерээс ажилладаг PowerShell скриптээр "
               "хийгддэг. Сервер өөрөө код бүтээдэггүй (санах ой хүрэлцэхгүй) — бүтээгдсэн "
               "файлууд шахагдаж, ssh-ээр хуулагдаж, pm2 процесс дахин асна."))
story.append(RAW("<font face='Body' size='8'>.\\scripts\\oci\\deploy.ps1            # production<br/>"
                 ".\\scripts\\oci\\deploy.ps1 -Staging   # туршилтын орчин</font>", "code"))
story.append(Spacer(1, 4))
table([["Алхам", "Юу болдог"],
       ["1", "Локал компьютер дээр pnpm build ажиллана"],
       ["2", "dist/ болон хамаарлын файлууд архивлагдана"],
       ["3", "ssh-ээр сервер рүү хуулагдана"],
       ["4", "Хамаарал өөрчлөгдсөн бол л pnpm install ажиллана"],
       ["5", "pm2 процесс дахин асч, эрүүл мэндийн шалгалт хийгдэнэ"],
       ["6", "Нийтийн хаягаар дахин шалгана (18 удаа, 5 секунд тутамд)"]],
      [14 * mm, W - 14 * mm])
note("deploy.ps1 нь PowerShell дээр 7 гэсэн exit code өгдөг нь ердийн stderr шуугиан. "
     "Эрүүл мэндийн шалгалт 200 буцаасан бол deploy АМЖИЛТТАЙ болсон.")

H("19.2 Нөөцлөлт", "h3")
table([["Давхарга", "Юу, хаана", "Хугацаа"],
       ["HeatWave автомат", "Өгөгдлийн сангийн өөрийн snapshot (ижил Oracle дансанд)", "7 хоног"],
       ["Серверийн cron", "Шифрлэгдсэн dump → хаалттай Cloudflare R2 сав", "30 хоног"],
       ["Лаптопын task", "Локал .zip хуулбар", "14 хувилбар"],
       ["Зураг (R2)", "Тусдаа нөөц — энэ хувилбарт нэмэгдсэн", "Долоо хоног тутам"]],
      [34 * mm, W - 68 * mm, 34 * mm])
story.append(P("Сэргээх: scripts/db-restore.ps1 нь анхдагчаар ТУСДАА «_restore_drill» нэртэй "
               "өгөгдлийн сан руу сэргээдэг тул бодит өгөгдлийг санамсаргүй дарж бичихгүй. "
               "Жинхэнэ сэргээлт хийх үед л -Force туг нэмнэ.", "p"))

H("19.3 Мониторинг", "h3")
table([["Юу", "Хэрхэн"],
       ["Сайт амьд эсэх", "GitHub Actions 10 минут тутам /health хаягийг шалгана; унавал утсанд мэдэгдэл"],
       ["Серверийн алдаа", "Honeybadger (түлхүүр тохируулсан үед)"],
       ["Үйл ажиллагааны мэдэгдэл", "ntfy — шинэ захиалга, төлбөр, цуцлал, нөөц бага"],
       ["Хөтөлбөрийн эмзэг байдал", "GitHub Dependabot + долоо хоног тутмын локал шалгалт"]],
      [42 * mm, W - 42 * mm])

# ---- 20. tests ----
H("20. Тест", "h2")
story.append(P("Кодыг өөрчлөхийн өмнө болон дараа дараах шалгалтуудыг ажиллуулна. Эдгээр нь "
               "бодит өгөгдлийн сан, бодит хөтөч ашигладаг тул «ногоон» гэдэг нь жинхэнэ утгатай."))
story.append(RAW("<font face='Body' size='8'>pnpm check      # TypeScript төрлийн шалгалт (2 удаа: апп + тест)<br/>"
                 "pnpm lint       # ESLint<br/>"
                 "pnpm exec vitest run --no-file-parallelism   # 1094 тест<br/>"
                 "pnpm build      # бүтээх (exit code-ийг ШУУД шалга)<br/>"
                 "pnpm e2e        # 156 Playwright тест, компьютер + утас</font>", "code"))
story.append(Spacer(1, 5))
rows = [["Playwright файл", "Юуг шалгадаг"]]
e2e_desc = {
    "storefront.spec.ts": "Нүүр хуудас, skip link, харанхуй горим, күүкийн самбар, хэл солих",
    "shop-navigation.spec.ts": "Каталог, хайлт/шүүлтүүр/хуудаслалт хаягт хадгалагдах",
    "cart.spec.ts": "Сагсанд нэмэх, тоо өөрчлөх, checkout руу орох",
    "search.spec.ts": "Кирилл/латин, буруу бичсэн үг, брэндийн мөр",
    "product-variants.spec.ts": "Хувилбартай бараа: үнэ солигдож зөв хувилбар сагсанд орох",
    "admin.spec.ts": "Эрхийн хаалт, бүтээгдэхүүн үүсгэх/устгах, эрх солих",
    "admin-search.spec.ts": "Синоним нэмэхэд хайлт шууд өөрчлөгдөх",
    "admin-delete-order.spec.ts": "Цуцлагдсан захиалгыг устгах",
    "admin-contrast.spec.ts": "Админы бүх текст хүртээмжийн контрастыг хангах",
    "face-handoff.spec.ts": "Камергүй компьютерт утсаар нэвтрэх QR",
    "pwa-install.spec.ts": "Апп болгон суулгах урсгал (Android, iPhone, компьютер)",
    "push-optin.spec.ts": "Мэдэгдэл авах зөвшөөрлийн гарц",
    "profile-body.spec.ts": "Арьсны асуулгын биеийн алхам хадгалагдах",
    "brand-logo.spec.ts": "Лого бодитоор ачаалагдах, админаас солигдох",
    "css-layers.spec.ts": "CSS давхаргын дүрэм (utility класс reset-ээс давамгайлах)",
}
for f in API["e2e"]:
    rows.append([f, e2e_desc.get(f, "—")])
table(rows, [50 * mm, W - 50 * mm])

# ---- 21. rules ----
H("21. Хэзээ ч зөрчиж болохгүй дүрмүүд", "h2", brk=True)
story.append(P("Дараах дүрэм бүр бодит алдаанаас гарсан. Кодод өөрчлөлт оруулах хүн бүр эдгээрийг "
               "мэдэх ёстой — тус бүр нь нэгэнт тохиолдсон, дахин тохиолдож болзошгүй асуудал."))
rules = [
    ("Өгөгдлийн сан", "Төлөв солих UPDATE бүр хуучин төлөвийг нөхцөлдөө бич, өөрчлөгдсөн мөрийн тоог шалга. Үүнгүйгээс болж нэг сагснаас хоёр захиалга үүсч байсан."),
    ("Өгөгдлийн сан", "Нөөцийг шууд бичихгүй — зөвхөн нөөцийн бүртгэлийн функцээр (applyBranchStockDelta / setBranchStockAbsolute / recordStockMovement)."),
    ("Өгөгдлийн сан", "Захиалга үүсгэдэг шинэ зам бүр давхардлаас хамгаалах дугаар (clientRequestId) авна."),
    ("Өгөгдлийн сан", "Хуудаслалттай query бүрт тогтвортой эцсийн эрэмбэ (id) нэм — эс бөгөөс нэг бараа хоёр хуудсанд гарч, өөр нэг нь огт гарахгүй."),
    ("Өгөгдлийн сан", "Хугацааны талбар секундын нарийвчлалтай: нэг секундэд үүссэн хоёр мөр эрэмбэд ТЭНЦЭНЭ."),
    ("Аюулгүй байдал", "Клиент рүү очих алдааны мессеж нь хэрэглэгчид зориулсан монгол өгүүлбэр л байх — драйверын алдаа дамжуулахгүй."),
    ("Аюулгүй байдал", "Шинэ админ API бичихдээ эрхийн builder ашигла (adminProcedure гэх мэт) — энгийн protectedProcedure ашиглавал царайны баталгаа шалгагдахгүй."),
    ("Аюулгүй байдал", "Гадагш чиглэсэн бүх сүлжээний дуудлагад хугацааны хязгаар (timeout) тавь."),
    ("Аюулгүй байдал", "Мэдэгдэлд харилцагчийн нэр, утас, хаягийг хэзээ ч бичихгүй (мэдэгдлийн суваг нээлттэй)."),
    ("Интерфейс", "index.html дотор inline script бичихгүй (CSP хориглоно)."),
    ("Интерфейс", "form дотор form бичихгүй — HTML зөвшөөрдөггүй, дотоод товч гадаад маягтад харьяалагдана."),
    ("Интерфейс", "Хэрэглэгчийн эрх/профайлд бичдэг шинэ зам session кэшийг цэвэрлэнэ — эс бөгөөс 5 секунд хуучин утга харагдана."),
    ("Тест", "E2E-г хэсэгчлэн ажиллуулсныг «ногоон» гэж тооцохгүй — бүтнээр нэг удаад ажиллуул."),
    ("Тест", "Тест бодит production өгөгдөл дээр бичих бол заавал хуулбар аваад буцааж сэргээ."),
    ("Тест", "«Локал ногоон» нь «CI ногоон» гэсэн үг биш: CI цэвэр схем дээр migration-ийн гинжээр байгуулагддаг."),
    ("Deploy", "Migration нь deploy-д АВТОМАТААР ордоггүй — production ба staging хоёуланд гараар ажиллуул."),
    ("Deploy", "pnpm build-ийн exit code-ийг шууд шалга; pipe-аар дамжуулвал алдаа нуугдаж, E2E хуучин бүтээгдэхүүн дээр ажиллана."),
]
rows = [["Хамрах хүрээ", "Дүрэм"]]
for a, b in rules:
    rows.append([a, b])
table(rows, [30 * mm, W - 30 * mm])

H("22. Энэ баримтыг дахин үүсгэх", "h2")
story.append(P("Код өөрчлөгдөхөд энэ гарын авлагын функц, API, тохиргооны жагсаалт хуучирна. "
               "Гараар засахын оронд үүсгэгч скриптийг дахин ажиллуулна — жагсаалт бүр эх кодоос "
               "шинээр уншигдана."))
story.append(RAW("<font face='Body' size='8'>python docs/manual/extract.py   # эх кодоос мэдээлэл цуглуулна<br/>"
                 "python docs/manual/build_pdf.py # энэ PDF-ийг дахин үүсгэнэ</font>", "code"))
story.append(Spacer(1, 10))
story.append(Paragraph("— Баримт дуусав —", ST["small"]))

doc = Doc(OUTPDF, pagesize=A4, title="SUGI ASAYAKE — Хүлээлцэх гарын авлага",
          author="SUGI ASAYAKE", subject="Handover reference manual")
doc.multiBuild(story)
print("WROTE", OUTPDF, os.path.getsize(OUTPDF), "bytes")
