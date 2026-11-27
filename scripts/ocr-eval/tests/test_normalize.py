from ocr_eval.metrics.normalize import char_class, normalize


def test_sara_am_composed_either_order():
    assert normalize("นํ้า") == normalize("น้ำ") == "น้ำ"


def test_whitespace_removed():
    assert normalize("ที่ นี่") == "ที่นี่"
    assert normalize("Save  file\tnow\n") == "Savefilenow"


def test_pua_mapped_back():
    assert normalize("ก") == normalize("่ก")


def test_zero_width_dropped():
    assert normalize("A​B") == "AB"
    assert normalize("A­B﻿") == "AB"


def test_mark_order_vowel_before_tone():
    assert normalize("ก้ิ") == "กิ้"


def test_case_preserved():
    assert normalize("Save") == "Save"


def test_double_sara_e_is_sara_ae():
    assert normalize("เเม่") == "แม่"


def test_char_classes():
    assert char_class("ก") == "thai_cons"
    assert char_class("ิ") == "thai_vowel_above"
    assert char_class("ุ") == "thai_vowel_below"
    assert char_class("่") == "thai_tone"
    assert char_class("์") == "thai_tone"
    assert char_class("า") == "thai_other"
    assert char_class("๕") == "thai_digit"
    assert char_class("A") == "latin_upper"
    assert char_class("z") == "latin_lower"
    assert char_class("7") == "digit"
    assert char_class("@") == "symbol"
