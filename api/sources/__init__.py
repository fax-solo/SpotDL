from abc import ABC, abstractmethod
from typing import TypedDict


class SearchResult(TypedDict):
    url: str
    title: str | None
    uploader: str | None
    source: str


class DownloadSource(ABC):
    name: str

    @abstractmethod
    def search(self, title: str, artist: str) -> list[SearchResult]:
        ...

    @abstractmethod
    def download(
        self,
        track_url: str,
        tmpdir: str,
        output_path: str,
        quality: str,
        output_format: str,
    ) -> str | None:
        ...

    def confidence_threshold(self) -> float:
        return 0.4


_sources: list[DownloadSource] = []


def register_source(source: DownloadSource):
    _sources.append(source)


def get_sources() -> list[DownloadSource]:
    return list(_sources)


def clear_sources():
    _sources.clear()


__all__ = [
    "SearchResult",
    "DownloadSource",
    "register_source",
    "get_sources",
    "clear_sources",
]
