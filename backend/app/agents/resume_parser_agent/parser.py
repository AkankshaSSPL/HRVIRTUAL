from __future__ import annotations

from pathlib import Path


class ResumeParsingError(ValueError):
    pass


def extract_text(path: Path, content_type: str) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf" or content_type == "application/pdf":
        return extract_pdf_text(path)
    if suffix == ".docx" or content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return extract_docx_text(path)
    raise ResumeParsingError("Unsupported resume file type.")


def extract_pdf_text(path: Path) -> str:
    try:
        import pdfplumber
    except ImportError as exc:
        raise ResumeParsingError("PDF parsing dependency is not installed.") from exc

    chunks: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                chunks.append(text)
    text = "\n".join(chunks).strip()
    if not text:
        raise ResumeParsingError("No readable text found in PDF resume.")
    return text


def extract_docx_text(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise ResumeParsingError("DOCX parsing dependency is not installed.") from exc

    document = Document(path)
    text = "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()).strip()
    if not text:
        raise ResumeParsingError("No readable text found in DOCX resume.")
    return text
