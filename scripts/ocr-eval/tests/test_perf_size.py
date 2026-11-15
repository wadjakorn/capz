from ocr_eval import perf, size


def test_parse_rss_linux_time_v():
    out = "\tCommand being timed: \"x\"\n\tMaximum resident set size (kbytes): 204800\n\tExit status: 0\n"
    assert perf.parse_rss_mb(out) == 200.0


def test_parse_rss_macos_time_l():
    out = "        1.23 real         0.50 user\n           209715200  maximum resident set size\n"
    assert perf.parse_rss_mb(out) == 200.0


def test_added_mb_is_backend_delta_plus_models():
    sizes = {"none_zip": 1_000_000, "ort_zip": 9_000_000, "tract_zip": 4_000_000, "models_zip": 3_000_000}
    assert size.added_mb(sizes, "ort") == round((9_000_000 - 1_000_000 + 3_000_000) / 1e6, 2)
    assert size.added_mb(sizes, "tract") == round((4_000_000 - 1_000_000 + 3_000_000) / 1e6, 2)
