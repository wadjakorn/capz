from ocr_eval import cli


def test_every_plan_command_exists():
    p = cli.build_parser()
    subs = next(a for a in p._actions if a.dest == "cmd").choices
    assert {"fetch", "corpus", "run", "score", "compare", "report", "sweep", "gate", "perf", "size", "all"} <= set(subs)


def test_corpus_determinism_share_flag():
    a = cli.build_parser().parse_args(["corpus", "--split", "dev", "--check-only", "--determinism", "1.0"])
    assert a.determinism == 1.0
