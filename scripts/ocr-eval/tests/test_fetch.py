import hashlib
import http.server
import threading
from pathlib import Path

import pytest

from ocr_eval.fetch import HashMismatch, fetch_pinned


class _Counter(http.server.SimpleHTTPRequestHandler):
    hits = 0

    def do_GET(self):  # noqa: N802
        type(self).hits += 1
        super().do_GET()

    def log_message(self, *args):
        pass


@pytest.fixture
def server(tmp_path):
    root = tmp_path / "srv"
    root.mkdir()
    (root / "blob.bin").write_bytes(b"hello ocr")
    _Counter.hits = 0
    handler = lambda *a, **k: _Counter(*a, directory=str(root), **k)  # noqa: E731
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/blob.bin"
    httpd.shutdown()


GOOD = hashlib.sha256(b"hello ocr").hexdigest()


def test_fetch_rejects_bad_hash(server, tmp_path):
    dest = tmp_path / "out" / "blob.bin"
    with pytest.raises(HashMismatch):
        fetch_pinned(server, dest, "0" * 64)
    assert not dest.exists()
    assert not Path(str(dest) + ".tmp").exists()


def test_fetch_skips_when_present(server, tmp_path):
    dest = tmp_path / "out" / "blob.bin"
    assert fetch_pinned(server, dest, GOOD) == dest
    assert dest.read_bytes() == b"hello ocr"
    assert _Counter.hits == 1
    fetch_pinned(server, dest, GOOD)
    assert _Counter.hits == 1
