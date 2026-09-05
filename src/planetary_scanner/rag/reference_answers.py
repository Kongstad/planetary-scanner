"""Grounded answer generation from retrieved reference records."""

import json
from collections.abc import Sequence
from typing import Protocol
from urllib.request import Request, urlopen

from pydantic import BaseModel

from planetary_scanner.rag.reference_retrieval import (
    ReferenceRetriever,
    RetrievedReferenceRecord,
)

DEFAULT_ANSWER_MODEL = "qwen2.5:3b"
OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate"


class AnswerGenerator(Protocol):
    """A local model capable of producing a structured grounded answer."""

    def generate(self, prompt: str) -> "GeneratedAnswer": ...


class GeneratedAnswer(BaseModel):
    """The limited fields the language model is allowed to provide."""

    answer: str
    insufficient_evidence: bool


class GroundedAnswer(BaseModel):
    """An answer paired with the application-controlled evidence citations."""

    answer: str
    insufficient_evidence: bool
    citations: list[RetrievedReferenceRecord]


def build_grounded_answer_prompt(
    question: str, records: Sequence[RetrievedReferenceRecord]
) -> str:
    """Build the complete evidence-bounded prompt for a local answer model."""

    evidence = "\n\n".join(
        f"[{record.document.document_id}]\n{record.document.content}" for record in records
    )
    return f"""You are PlanetaryScanner's scientific reference assistant.
Answer the question using only the evidence records below. Do not use outside knowledge.
If the evidence does not answer the question, set insufficient_evidence to true and explain briefly.
When insufficient_evidence is true, answer with a plain-language explanation; never write only
"insufficient_evidence" or a JSON field name as the answer.
Return valid JSON only, exactly matching this schema:
{{"answer": "string", "insufficient_evidence": true}}

Question:
{question}

Evidence records:
{evidence}
"""


class OllamaAnswerGenerator:
    """Synchronous adapter for Ollama's local generate API."""

    def __init__(self, model_name: str = DEFAULT_ANSWER_MODEL) -> None:
        self._model_name = model_name

    def generate(self, prompt: str) -> GeneratedAnswer:
        request = Request(
            OLLAMA_GENERATE_URL,
            data=json.dumps(
                {
                    "model": self._model_name,
                    "prompt": prompt,
                    "format": GeneratedAnswer.model_json_schema(),
                    "stream": False,
                    "options": {"temperature": 0},
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=120) as response:
            payload = json.loads(response.read())
        return GeneratedAnswer.model_validate_json(payload["response"])


class GroundedAnswerService:
    """Retrieves evidence and generates an answer constrained to that evidence."""

    def __init__(self, retriever: ReferenceRetriever, generator: AnswerGenerator) -> None:
        self._retriever = retriever
        self._generator = generator

    def answer(self, question: str, limit: int = 3) -> GroundedAnswer:
        """Answer a question and return the exact evidence given to the model."""

        citations = self._retriever.retrieve(question, limit)
        generated = self._generator.generate(build_grounded_answer_prompt(question, citations))
        answer = generated.answer
        if generated.insufficient_evidence and answer.strip().lower() == "insufficient_evidence":
            answer = "The retrieved reference records do not provide enough evidence to answer this question."
        return GroundedAnswer(
            answer=answer,
            insufficient_evidence=generated.insufficient_evidence,
            citations=citations,
        )