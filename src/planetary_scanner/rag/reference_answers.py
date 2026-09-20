"""Grounded answer generation from retrieved reference records."""

import json
from collections.abc import Sequence
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from planetary_scanner.rag.reference_retrieval import (
    ReferenceRecordRetriever,
    RetrievedReferenceRecord,
)

DEFAULT_ANSWER_MODEL = "qwen2.5:3b"
OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"


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


def is_ollama_model_available(model_name: str = DEFAULT_ANSWER_MODEL) -> bool:
    """Return whether the configured local answer model is available from Ollama."""
    try:
        with urlopen(OLLAMA_TAGS_URL, timeout=5) as response:
            models = json.loads(response.read())["models"]
    except (HTTPError, URLError, TimeoutError, KeyError, json.JSONDecodeError):
        return False
    return any(model.get("name") == model_name for model in models)


def build_grounded_answer_prompt(
    question: str, records: Sequence[RetrievedReferenceRecord]
) -> str:
    """Build the complete evidence-bounded prompt for a local answer model."""

    evidence = "\n\n".join(
        f"[{record.document.document_id}]\n{record.document.content}" for record in records
    )
    return f"""You are the Planetary Scanner Science Computer: calm, precise, and evidence-first.
Respond in a concise mission-analysis voice that remains natural and readable. Do not roleplay,
invent observations, or add dramatic language. Answer the question using only the evidence records
below. Do not use outside knowledge.
For a direct factual value stated in an evidence record, answer in one concise, complete sentence
that names the measured property and reports its exact value and unit, then set
insufficient_evidence to false. For example: "Earth's bulk iron mass fraction is 32.1%."
For a broad question, synthesize the relevant evidence into one or two natural, scientifically
useful sentences. Do not mechanically list every retrieved fact. Translate categorical values into
ordinary prose, or omit them when they add no useful information; never quote UI-style labels such
as "LIFE ABUNDANT". Present dimensionless fractions used for composition or abundance as percentages
(for example, 0.321 as 32.1%), retaining the source precision. Mention dates only when they are
needed to interpret a measurement. When summarizing components that form a complete group, account
for every provided component accurately. Do not invent totals or describe a listed remainder as
unaccounted-for mass.
If the evidence does not answer the question, set
insufficient_evidence to true and explain briefly. Never use a boolean as the answer value.
Return valid JSON only with two fields: "answer" (a human-readable string) and
"insufficient_evidence" (a boolean).

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

    def __init__(
        self,
        retriever: ReferenceRecordRetriever,
        generator: AnswerGenerator,
    ) -> None:
        self._retriever = retriever
        self._generator = generator

    def answer(self, question: str, limit: int = 3) -> GroundedAnswer:
        """Answer a question and return the exact evidence given to the model."""

        citations = self._retriever.retrieve(question, limit)
        generated = self._generator.generate(build_grounded_answer_prompt(question, citations))
        answer = generated.answer
        if generated.insufficient_evidence and answer.strip().lower() in {
            "insufficient evidence",
            "insufficient_evidence",
        }:
            answer = "The retrieved reference records do not provide enough evidence to answer this question."
        return GroundedAnswer(
            answer=answer,
            insufficient_evidence=generated.insufficient_evidence,
            citations=citations,
        )