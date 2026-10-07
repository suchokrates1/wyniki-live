"""The admin's tablet list names each tablet's model, from what the table stores."""
from wyniki.services.device_alerts import stored_tablet_label


def test_the_model_comes_from_the_stored_columns():
    assert stored_tablet_label({"manufacturer": "Teclast", "model": "P50Ai_ROW", "device": "x"}) == "Teclast P50Ai_ROW"
    assert stored_tablet_label({"manufacturer": "OnePlus", "model": "OnePlus8Pro"}) == "OnePlus8Pro"
    assert stored_tablet_label({"device": "Xiaomi 25069PTEBG"}) == "Xiaomi 25069PTEBG"
