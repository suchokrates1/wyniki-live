from wyniki.services.tablet_aliases import annotate_tablet, fleet_label


def test_oneplus_is_always_tablet_6():
    assert fleet_label(device="OnePlus OPD2480", device_model="OPD2480", court_name="3") == "Tablet 6"
    assert fleet_label(device_manufacturer="OnePlus", device_model="OPD2480", court_name="Main") == "Tablet 6"


def test_teclast_uses_vilnius_home_court():
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="16") == "Tablet 1"
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="17") == "Tablet 2"
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="3") == "Tablet 3"
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="6") == "Tablet 4"
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="9") == "Tablet 5"
    assert fleet_label(device="Teclast P50Ai_ROW", court_name="8") == "Tablet (Teclast)"


def test_foreign_phone_keeps_model():
    assert fleet_label(device="samsung SM-S911B", device_manufacturer="samsung", device_model="SM-S911B") == "samsung SM-S911B"


def test_annotate_tablet_sets_label():
    row = annotate_tablet(
        {"device": "OnePlus OPD2480", "platform": "android", "battery_level": 81},
        "2",
    )
    assert row["label"] == "Tablet 6"
