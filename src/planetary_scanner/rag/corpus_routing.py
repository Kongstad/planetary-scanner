"""Route shared astronomy topics and named catalog objects across viewer tabs."""

import re
import unicodedata
from collections.abc import Iterable

from planetary_scanner.models.reference import RagDocument

_COMMON_NAMES = frozenset(
    [
        "earth",
        "mars",
        "luna",
        "moon",
        "sol",
        "sun",
        "water",
        "ice",
        "head",
        "point",
        "cone",
        "flag",
        "station",
        "north",
        "south",
        "east",
        "west",
        "young",
        "long",
        "short",
        "major",
        "minor",
        "sample",
        "area",
        "field",
        "time",
        "love",
        "hope",
        "life",
        "white",
        "black",
        "green",
        "brown",
        "red",
        "blue",
        "crater",
        "mountain",
        "valley",
        "lake",
        "plain",
    ]
)
_GALACTIC = re.compile(
    r"\b(?:milky way|galax(?:y|ies)|galactic|exoplanets?|extra solar|extrasolar|"
    r"habitable zone|super earths?|hot jupiters?|mini neptunes?|"
    r"transit (?:method|spectroscopy)|radial velocity|microlensing|"
    r"dark matter|dark energy|black holes?|sagittarius a|"
    r"stellar evolution|star formation|spectral (?:class|type|sequence)|brown dwarfs?|pulsars?|white dwarfs?|red dwarfs?|neutron stars?|"
    r"supernovae?|protostars?|molecular clouds?|globular clusters?|"
    r"local group|andromeda|light years?|parsecs?)\b"
)
_SOLAR_SYSTEM = re.compile(
    r"\b(?:solar system|mercury|venus|jupiter|saturn|uranus|neptune|pluto|"
    r"ceres|eris|haumea|makemake|europa|titan|enceladus|io|ganymede|"
    r"callisto|phobos|deimos|asteroids?|comets?|meteoroids?|meteorites?|"
    r"kuiper|oort|dwarf planets?|gas giants?|ice giants?|terrestrial planets?|"
    r"other planets|other moons|roadster)\b"
)


def normalize_name(text: str) -> str:
    ascii_text = "".join(
        character
        for character in unicodedata.normalize("NFKD", text.lower())
        if not unicodedata.combining(character)
    )
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text))


class EntityLookup:
    def __init__(self, documents: Iterable[RagDocument]) -> None:
        self._names: dict[str, list[tuple[str, RagDocument]]] = {}
        for document in documents:
            entity = document.metadata.get("entity_name")
            if not isinstance(entity, str):
                continue
            name = normalize_name(entity)
            if name in _COMMON_NAMES or len(name) < 3:
                continue
            self._names.setdefault(name.split()[0], []).append((name, document))
            if "proxima cen " in name:
                alias = name.replace("proxima cen ", "proxima centauri ")
                self._names.setdefault(alias.split()[0], []).append((alias, document))

    def match(self, question: str) -> list[RagDocument]:
        normalized = normalize_name(question)
        matches: dict[str, RagDocument] = {}
        for token in set(normalized.split()):
            for name, document in self._names.get(token, []):
                if f" {name} " in f" {normalized} ":
                    matches[document.document_id] = document
        return [
            document
            for document in matches.values()
            if not any(
                document.document_id != other.document_id
                and f" {normalize_name(str(document.metadata['entity_name']))} "
                in f" {normalize_name(str(other.metadata['entity_name']))} "
                for other in matches.values()
            )
        ]


def shared_collection(question: str) -> str | None:
    normalized = normalize_name(question)
    if _GALACTIC.search(normalized):
        return "milky-way"
    if re.search(r"\b(?:stars?|stellar)\b", normalized) and not re.search(
        r"\b(?:sun|sol)\b", normalized
    ):
        return "milky-way"
    if re.search(r"\b(?:phobos|deimos)\b", normalized):
        return "mars"
    if _SOLAR_SYSTEM.search(normalized):
        return "solar-system"
    if re.search(r"\b(?:sunspots?|solar activity)\b", normalized):
        return "sol"
    if "earthquake" in normalized and not re.search(
        r"\b(?:mars|martian|moon|lunar)\b", normalized
    ):
        return "earth"
    return None
