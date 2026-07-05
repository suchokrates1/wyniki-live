from wyniki.services.categories import (
    format_category_display,
    is_mixed_category,
    is_mixed_section_label,
    normalize_category_code,
    start_group_key,
)


def test_normalize_category_code_handles_b34_variants():
    assert normalize_category_code('B3/4') == 'B34'
    assert normalize_category_code('b34') == 'B34'
    assert normalize_category_code('B1') == 'B1'


def test_normalize_player_classification_rejects_b34():
    from wyniki.services.categories import normalize_player_classification

    assert normalize_player_classification('B34') == ''
    assert normalize_player_classification('B3/4') == ''
    assert normalize_player_classification('B3') == 'B3'
    assert normalize_player_classification('b4') == 'B4'


def test_b34_is_mixed_only_when_configured_for_tournament():
    assert is_mixed_category('B34', ['B34'])
    assert is_mixed_category('B3/4', ['B34'])
    assert not is_mixed_category('B34')
    assert not is_mixed_category('B34', ['B1'])
    assert not is_mixed_category('B3')
    assert not is_mixed_category('B4')


def test_start_group_key_respects_tournament_mixed_categories():
    assert start_group_key('B34', 'K', ['B34']) == 'B34'
    assert start_group_key('B34', 'M', ['B34']) == 'B34'
    assert start_group_key('B2', '', ['B2', 'B34']) == 'B2'
    assert start_group_key('B34', 'K') == 'B34K'
    assert start_group_key('B34', 'M') == 'B34M'
    assert start_group_key('B1', 'K') == 'B1K'
    assert start_group_key('B1', 'M') == 'B1M'


def test_format_category_display():
    assert format_category_display('B34') == 'B3/4'
    assert format_category_display('B1') == 'B1'
    assert format_category_display('B2') == 'B2'


def test_mixed_category_label_per_band():
    from wyniki.services.categories import mixed_category_label
    assert mixed_category_label('B2') == 'B2 Mixed'
    assert mixed_category_label('B34') == 'B3/4 Mixed'


def test_is_mixed_section_label():
    assert is_mixed_section_label('Mixed')
    assert is_mixed_section_label('mix')
    assert not is_mixed_section_label('Kobiet')
