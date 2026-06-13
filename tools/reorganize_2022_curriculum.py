from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path

import fitz


BASE_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = BASE_DIR / "2022_교육과정_모음"
TARGET_DIR = BASE_DIR / "2022_Revised_National_Curriculum"
DOCUMENTS_DIR = TARGET_DIR / "documents"


TITLE_BY_BOOK = {
    1: ("General Guidelines", "총론"),
    4: ("High School Curriculum", "고등학교"),
    5: ("Korean Language Curriculum", "국어과"),
    6: ("Moral Education Curriculum", "도덕과"),
    7: ("Social Studies Curriculum", "사회과"),
    8: ("Mathematics Curriculum", "수학과"),
    9: ("Science Curriculum", "과학과"),
    10: ("Practical Arts Technology Home Economics and Informatics Curriculum", "실과(기술가정)정보과"),
    11: ("Physical Education Curriculum", "체육과"),
    12: ("Music Curriculum", "음악과"),
    13: ("Art Curriculum", "미술과"),
    14: ("English Curriculum", "영어과"),
    15: ("Integrated Subjects Curriculum", "바른 생활, 슬기로운 생활, 즐거운 생활"),
    17: ("Classical Chinese Curriculum", "한문과"),
    18: ("Middle School Elective Subjects Curriculum", "중학교 선택 교과"),
    19: ("High School Liberal Arts Curriculum", "고등학교 교양 교과"),
    20: ("Science Specialized Elective Subjects Curriculum", "과학 계열 선택 과목"),
    21: ("Physical Education Specialized Elective Subjects Curriculum", "체육 계열 선택 과목"),
    22: ("Arts Specialized Elective Subjects Curriculum", "예술 계열 선택 교과"),
    23: ("Business and Finance Professional Curriculum", "경영·금융 전문 교과"),
    24: ("Health and Welfare Professional Curriculum", "보건·복지 전문 교과"),
    25: ("Culture Arts Design and Broadcasting Professional Curriculum", "문화·예술·디자인·방송 전문 교과"),
    26: ("Beauty Professional Curriculum", "미용 전문 교과"),
    27: ("Tourism and Leisure Professional Curriculum", "관광·레저 전문 교과"),
    28: ("Food and Culinary Professional Curriculum", "식품·조리 전문 교과"),
    29: ("Architecture and Civil Engineering Professional Curriculum", "건축·토목 전문 교과"),
    30: ("Machinery Professional Curriculum", "기계 전문 교과"),
    31: ("Materials Professional Curriculum", "재료 전문 교과"),
    32: ("Chemical Industry Professional Curriculum", "화학 공업 전문 교과"),
    33: ("Textile and Clothing Professional Curriculum", "섬유·의류 전문 교과"),
    34: ("Electrical and Electronic Professional Curriculum", "전기·전자 전문 교과"),
    35: ("Information and Communication Professional Curriculum", "정보·통신 전문 교과"),
    36: ("Environment Safety and Firefighting Professional Curriculum", "환경·안전·소방 전문 교과"),
    37: ("Agriculture Forestry and Livestock Professional Curriculum", "농림·축산 전문 교과"),
    38: ("Fisheries and Maritime Professional Curriculum", "수산·해운 전문 교과"),
    39: ("Convergence and Intellectual Property Professional Curriculum", "융복합·지식 재산 전문 교과"),
}


CATEGORY_BY_BOOK = {
    1: "national_common",
    4: "school_level",
    5: "common_subject",
    6: "common_subject",
    7: "common_subject",
    8: "common_subject",
    9: "common_subject",
    10: "common_subject",
    11: "common_subject",
    12: "common_subject",
    13: "common_subject",
    14: "common_subject",
    15: "elementary_integrated_subject",
    17: "common_subject",
    18: "middle_school_elective",
    19: "high_school_liberal_arts",
    20: "specialized_elective",
    21: "specialized_elective",
    22: "specialized_elective",
}


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def book_number(path: Path) -> int:
    match = re.search(r"(?:별책|\[별책)(\d+)", path.name)
    if not match:
        raise ValueError(f"Cannot find book number: {path}")
    return int(match.group(1))


def version_note(path: Path) -> str:
    name = path.name
    if "수정" in name:
        return "revised_copy"
    if "2026-1" in name or "2026.1.21" in name:
        return "notice_2026_1"
    if "2024-3" in name or "2024.08.16" in name:
        return "notice_2024_3"
    if "(1)" in name:
        return "duplicate_copy_1"
    if "(2)" in name:
        return "duplicate_copy_2"
    return "source_copy"


def source_sort_key(path: Path) -> tuple[int, int, str]:
    priority = {
        "source_copy": 0,
        "notice_2026_1": 1,
        "notice_2024_3": 2,
        "revised_copy": 3,
        "duplicate_copy_1": 8,
        "duplicate_copy_2": 9,
    }
    return (book_number(path), priority.get(version_note(path), 5), str(path.relative_to(SOURCE_DIR)))


def output_name(path: Path, index_for_book: int = 1) -> str:
    n = book_number(path)
    english, _ = TITLE_BY_BOOK.get(n, (f"Book {n}", f"별책{n}"))
    stem = f"book_{n:02d}_{slugify(english)}"
    note = version_note(path)
    if note not in {"source_copy"}:
        stem = f"{stem}_{note}"
    if index_for_book > 1 and note == "source_copy":
        stem = f"{stem}_{index_for_book}"
    return f"{stem}.md"


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    compact: list[str] = []
    blank = False
    for line in lines:
        if line.strip():
            compact.append(line)
            blank = False
        elif not blank:
            compact.append("")
            blank = True
    return "\n".join(compact)


def extract_heading_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or len(line) > 90:
            continue
        if re.match(r"^(제?\d+[장절]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.|\d+\.)\s+", line):
            candidates.append(line)
        elif re.match(r"^[가-힣A-Za-z·\s()]+ 교육과정$", line):
            candidates.append(line)
    seen: set[str] = set()
    result: list[str] = []
    for item in candidates:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result[:40]


@dataclass
class SourceRecord:
    book: int
    korean_title: str
    english_title: str
    category: str
    source_path: str
    source_file: str
    source_hash: str
    output_file: str
    pages: int
    duplicate_of: str | None
    version_note: str


def yaml_list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "\n" + "\n".join(f"  - {json.dumps(item, ensure_ascii=False)}" for item in items)


def write_markdown(path: Path, record: SourceRecord, aliases: list[str], toc: list[list], heading_candidates: list[str], pages: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    lines.extend(
        [
            "---",
            f"book: {record.book}",
            f"korean_title: {json.dumps(record.korean_title, ensure_ascii=False)}",
            f"english_title: {json.dumps(record.english_title, ensure_ascii=False)}",
            f"category: {record.category}",
            f"source_file: {json.dumps(record.source_file, ensure_ascii=False)}",
            f"source_path: {json.dumps(record.source_path, ensure_ascii=False)}",
            f"source_hash: {record.source_hash}",
            f"pages: {record.pages}",
            f"version_note: {record.version_note}",
            f"source_aliases: {yaml_list(aliases)}",
            "---",
            "",
            f"# Book {record.book:02d}. {record.english_title}",
            "",
            f"- Korean title: {record.korean_title}",
            f"- Source file: {record.source_file}",
            f"- Source hash: `{record.source_hash}`",
            f"- Pages: {record.pages}",
            "",
            "## Use Notes for Curriculum-Aware Chatbots",
            "",
            "- Treat this file as source-grounding material for the named Korean curriculum area.",
            "- Use the Korean title and source aliases when matching Korean user requests.",
            "- Keep answers within the teacher-selected school level, subject, and topic.",
            "- For students, prefer guided questions over direct final answers.",
            "",
            "## Source Aliases",
            "",
        ]
    )
    if aliases:
        lines.extend(f"- {alias}" for alias in aliases)
    else:
        lines.append("- None")
    lines.extend(["", "## PDF Table of Contents", ""])
    if toc:
        for level, title, page in toc:
            indent = "  " * max(level - 1, 0)
            lines.append(f"{indent}- p.{page}: {title}")
    else:
        lines.append("- No embedded PDF table of contents found.")
    lines.extend(["", "## Heading Candidates", ""])
    if heading_candidates:
        lines.extend(f"- {h}" for h in heading_candidates)
    else:
        lines.append("- No reliable heading candidates detected.")
    lines.extend(["", "## Page Text", ""])
    for idx, text in enumerate(pages, start=1):
        lines.append(f"### Page {idx}")
        lines.append("")
        lines.append(text if text else "[No extractable text on this page.]")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def write_alias(path: Path, record: SourceRecord, canonical_output: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(
        [
            "---",
            f"book: {record.book}",
            f"korean_title: {json.dumps(record.korean_title, ensure_ascii=False)}",
            f"english_title: {json.dumps(record.english_title, ensure_ascii=False)}",
            f"category: {record.category}",
            f"source_file: {json.dumps(record.source_file, ensure_ascii=False)}",
            f"source_path: {json.dumps(record.source_path, ensure_ascii=False)}",
            f"source_hash: {record.source_hash}",
            f"pages: {record.pages}",
            f"duplicate_of: {canonical_output}",
            f"version_note: {record.version_note}",
            "---",
            "",
            f"# Duplicate Source for Book {record.book:02d}. {record.english_title}",
            "",
            f"This PDF has the same SHA-256 hash as `{canonical_output}`.",
            "",
            "Use the canonical document for full extracted text.",
            "",
            f"- Korean title: {record.korean_title}",
            f"- Source file: {record.source_file}",
            f"- Source hash: `{record.source_hash}`",
            f"- Canonical document: `documents/{canonical_output}`",
            "",
        ]
    )
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> None:
    if not SOURCE_DIR.exists():
        raise FileNotFoundError(SOURCE_DIR)
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(SOURCE_DIR.rglob("*.pdf"), key=source_sort_key)
    hash_groups: dict[str, list[Path]] = defaultdict(list)
    for pdf in pdfs:
        hash_groups[sha256(pdf)].append(pdf)

    book_counts: dict[int, int] = defaultdict(int)
    records: list[SourceRecord] = []
    canonical_by_hash: dict[str, str] = {}

    for pdf in pdfs:
        n = book_number(pdf)
        book_counts[n] += 1
        english, korean = TITLE_BY_BOOK.get(n, (f"Book {n}", f"별책{n}"))
        category = CATEGORY_BY_BOOK.get(n, "professional_subject")
        digest = sha256(pdf)
        out_file = output_name(pdf, book_counts[n])
        duplicate_of = canonical_by_hash.get(digest)

        with fitz.open(str(pdf)) as doc:
            pages = doc.page_count
            toc = doc.get_toc(simple=True)
            page_texts = [clean_text(page.get_text("text")) for page in doc]

        record = SourceRecord(
            book=n,
            korean_title=korean,
            english_title=english,
            category=category,
            source_path=str(pdf.relative_to(BASE_DIR)).replace("\\", "/"),
            source_file=pdf.name,
            source_hash=digest,
            output_file=out_file,
            pages=pages,
            duplicate_of=duplicate_of,
            version_note=version_note(pdf),
        )
        records.append(record)

        if duplicate_of:
            write_alias(DOCUMENTS_DIR / out_file, record, duplicate_of)
            continue

        canonical_by_hash[digest] = out_file
        aliases = [p.name for p in hash_groups[digest] if p != pdf]
        heading_candidates = extract_heading_candidates("\n".join(page_texts[:20]))
        write_markdown(DOCUMENTS_DIR / out_file, record, aliases, toc, heading_candidates, page_texts)

    write_index(records)
    write_manifest(records)
    write_crosswalk(records)


def write_index(records: list[SourceRecord]) -> None:
    lines = [
        "# 2022 Revised National Curriculum Index",
        "",
        "이 폴더는 `2022_교육과정_모음`의 PDF 교육과정을 챗봇 개발자가 읽기 쉬운 Markdown 자료로 재정리한 것입니다.",
        "",
        "## Folder Structure",
        "",
        "- `documents/`: PDF별 정리 Markdown. 파일명은 영문입니다.",
        "- `file_name_crosswalk.csv`: 원본 한글 파일명과 영문 산출물 파일명 매핑입니다.",
        "- `manifest.json`: 프로그램에서 읽기 쉬운 메타데이터입니다.",
        "",
        "## Naming Rule",
        "",
        "- `book_XX_english_title.md` 형식입니다.",
        "- 고시 버전이나 수정본이 파일명에 드러나는 경우 `_notice_2026_1`, `_notice_2024_3`, `_revised_copy`를 붙였습니다.",
        "- 같은 SHA-256 해시를 가진 완전 중복 PDF는 별도 alias 문서를 만들고 canonical 문서를 가리키게 했습니다.",
        "",
        "## Documents",
        "",
        "| Book | Korean title | Category | Output file | Source file | Duplicate of |",
        "|---:|---|---|---|---|---|",
    ]
    for r in sorted(records, key=lambda x: (x.book, x.output_file)):
        duplicate = r.duplicate_of or ""
        lines.append(
            f"| {r.book} | {r.korean_title} | {r.category} | `documents/{r.output_file}` | {r.source_file} | {duplicate} |"
        )
    (TARGET_DIR / "INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_manifest(records: list[SourceRecord]) -> None:
    payload = {
        "source_dir": str(SOURCE_DIR.relative_to(BASE_DIR)).replace("\\", "/"),
        "target_dir": str(TARGET_DIR.relative_to(BASE_DIR)).replace("\\", "/"),
        "document_count": len(records),
        "canonical_document_count": sum(1 for r in records if not r.duplicate_of),
        "duplicate_document_count": sum(1 for r in records if r.duplicate_of),
        "records": [asdict(r) for r in sorted(records, key=lambda x: (x.book, x.output_file))],
    }
    (TARGET_DIR / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )


def write_crosswalk(records: list[SourceRecord]) -> None:
    with (TARGET_DIR / "file_name_crosswalk.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "book",
                "korean_title",
                "english_title",
                "category",
                "source_file",
                "output_file",
                "duplicate_of",
                "source_hash",
                "pages",
                "version_note",
            ],
        )
        writer.writeheader()
        for r in sorted(records, key=lambda x: (x.book, x.output_file)):
            writer.writerow(
                {
                    "book": r.book,
                    "korean_title": r.korean_title,
                    "english_title": r.english_title,
                    "category": r.category,
                    "source_file": r.source_file,
                    "output_file": f"documents/{r.output_file}",
                    "duplicate_of": r.duplicate_of or "",
                    "source_hash": r.source_hash,
                    "pages": r.pages,
                    "version_note": r.version_note,
                }
            )


if __name__ == "__main__":
    main()
