# Extracts the real API surface of the repo so the handover manual documents
# what actually exists (never a remembered/invented list).
import io, re, json, os, glob

# Репозиторын язгуур нь энэ скриптийн байрлалаас гарна (docs/manual/ -> ../..).
# Хатуу зам бичих нь өөр машин дээр (ажлын лаптоп, худалдан авагчийн компьютер)
# шууд унана — энэ бол хүлээлцэх багцын нэг хэсэг.
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
out = {}

# ---- tRPC routers and procedures ----------------------------------------
src = io.open("server/routers.ts", encoding="utf-8").read()
lines = src.split("\n")
routers, cur = [], None
router_re = re.compile(r'^\s*(?:export const )?(\w+)[:=]\s*router\(\{')
proc_re = re.compile(r'^\s{2,4}(\w+):\s*([A-Za-z]*[Pp]rocedure)')
for i, l in enumerate(lines):
    m = router_re.match(l)
    if m:
        cur = {"name": m.group(1), "line": i + 1, "procs": []}
        routers.append(cur)
        continue
    if cur is not None:
        m2 = proc_re.match(l)
        if m2:
            kind = "query" if ".query(" in l else ("mutation" if ".mutation(" in l else "")
            if not kind:
                nxt = " ".join(lines[i + 1:i + 4])
                kind = "query" if ".query(" in nxt else ("mutation" if ".mutation(" in nxt else "?")
            cur["procs"].append({"name": m2.group(1), "guard": m2.group(2), "kind": kind, "line": i + 1})
out["routers"] = [r for r in routers if r["procs"]]

# ---- exported functions + the comment written above each -----------------
def doc_above(ls, idx):
    j, buf = idx - 1, []
    while j >= 0:
        t = ls[j].strip()
        if t.startswith("*/"):
            k, blk = j, []
            while k >= 0 and not ls[k].strip().startswith("/*"):
                blk.append(ls[k]); k -= 1
            blk.append(ls[k] if k >= 0 else "")
            blk = [re.sub(r'^\s*(/\*\*|\*/|\*)\s?', '', x).strip() for x in reversed(blk)]
            return re.sub(r'\s+', ' ', " ".join(x for x in blk if x)).strip()
        if t.startswith("//"):
            buf.append(re.sub(r'^//\s?', '', t)); j -= 1; continue
        if t == "" and buf:
            j -= 1; continue
        break
    return re.sub(r'\s+', ' ', " ".join(reversed(buf))).strip()

files = {}
for path in sorted(glob.glob("server/**/*.ts", recursive=True) + glob.glob("shared/**/*.ts", recursive=True)):
    if ".test." in path or path.endswith(".d.ts"):
        continue
    s = io.open(path, encoding="utf-8").read()
    ls = s.split("\n")
    purpose = ""
    m = re.search(r'/\*\*(.*?)\*/', s, re.S)
    if m and m.start() < 400:
        purpose = re.sub(r'\s+', ' ', " ".join(re.sub(r'^\s*\*\s?', '', x).strip() for x in m.group(1).split("\n"))).strip()
    fns = []
    for i, l in enumerate(ls):
        m = re.match(r'export (?:async )?function (\w+)', l) or re.match(r'export const (\w+)\s*[:=]\s*(?:async\s*)?\(', l)
        if m:
            sig = l.strip().rstrip("{").strip()
            fns.append({"name": m.group(1), "sig": (sig[:187] + "...") if len(sig) > 190 else sig,
                        "doc": doc_above(ls, i)[:420], "line": i + 1})
    if fns or purpose:
        files[path.replace("\\", "/")] = {"purpose": purpose[:800], "fns": fns, "loc": len(ls)}
out["files"] = files

# ---- env vars ------------------------------------------------------------
envs = set()
for path in glob.glob("server/**/*.ts", recursive=True) + glob.glob("scripts/**/*.*", recursive=True) + glob.glob("shared/**/*.ts", recursive=True):
    try:
        s = io.open(path, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    for m in re.finditer(r'process\.env\.([A-Z0-9_]+)', s):
        envs.add(m.group(1))
out["env"] = sorted(envs)

# ---- schema, migrations --------------------------------------------------
sch = io.open("drizzle/schema.ts", encoding="utf-8").read()
out["tables"] = sorted(set(t for _, t in re.findall(r'export const (\w+) = mysqlTable\(\s*"([^"]+)"', sch)))
out["migrations"] = sorted(os.path.basename(p) for p in glob.glob("drizzle/*.sql"))

# ---- admin sections, settings, tips -------------------------------------
aw = io.open("client/src/components/admin/AdminSidebar.tsx", encoding="utf-8").read()
out["admin_sections"] = re.findall(r'key:\s*"(\w+)"[^}]{0,160}?label:\s*"([^"]+)"', aw, re.S)
ss = io.open("shared/store-settings.ts", encoding="utf-8").read()
def field(block, name):
    m = re.search(name + r':\s*"((?:[^"\\]|\\.)*)"', block)
    return m.group(1).replace('\\"', '"') if m else ""

settings = []
for block in re.split(r'\n  \},?\n', ss):
    k = field(block, "key")
    if k and field(block, "group"):
        settings.append({"key": k, "group": field(block, "group"), "label": field(block, "label"),
                         "desc": field(block, "description")[:300], "fallback": field(block, "fallbackValue")[:160]})
out["settings"] = settings
tips_src = io.open("shared/admin-tips.ts", encoding="utf-8").read()
tips = {}
for m in re.finditer(r'\n  (\w+): \{\n\s*summary: "(.*?)",\n', tips_src):
    tips[m.group(1)] = m.group(2).replace('\\"', '"')
out["tips"] = tips

# ---- client pages + components ------------------------------------------
out["pages"] = sorted(os.path.basename(p) for p in glob.glob("client/src/pages/*.tsx"))
out["components"] = len(glob.glob("client/src/components/**/*.tsx", recursive=True))
out["e2e"] = sorted(os.path.basename(p) for p in glob.glob("e2e/*.spec.ts"))
out["scripts"] = sorted(os.path.basename(p) for p in glob.glob("scripts/*.*") + glob.glob("scripts/oci/*.*"))

io.open(os.path.join(OUT, "api.json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("routers:", len(out["routers"]), "procs:", sum(len(r["procs"]) for r in out["routers"]))
print("files:", len(files), "fns:", sum(len(v["fns"]) for v in files.values()))
print("tables:", len(out["tables"]), "migrations:", len(out["migrations"]), "env:", len(out["env"]))
print("sections:", len(out["admin_sections"]), "settings:", len(out["settings"]), "tips:", len(out["tips"]))
print("pages:", len(out["pages"]), "components:", out["components"], "e2e:", len(out["e2e"]), "scripts:", len(out["scripts"]))
