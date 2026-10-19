import pytest
from app.crypto.shredder import CryptoShredder, SUBCOLLECTIONS_TO_SHRED


@pytest.mark.anyio
async def test_crypto_shredding_unrecoverable(mock_db):
    shredder = CryptoShredder(mock_db)
    bubble_id = "shred-target-bubble"
    host_id = "host-alice"

    bubble_ref = mock_db.collection("bubbles").document(bubble_id)
    await bubble_ref.set({
        "id": bubble_id,
        "title": "Confidential M&A Deliberation",
        "pop_state": "SHREDDING",
        "host_id": host_id,
    })

    # Populate sensitive messages and contributions
    for i in range(10):
        await bubble_ref.collection("messages").document(f"m_{i}").set({
            "text": f"Confidential merger detail #{i}",
        })
        await bubble_ref.collection("contributions").document(f"c_{i}").set({
            "text": f"Secret document data #{i}",
        })
        await bubble_ref.collection("chunks").document(f"chk_{i}").set({
            "embedding": [0.1] * 768,
        })

    # Store key material
    await mock_db.collection("_crypto_keys").document(bubble_id).set({
        "encrypted_master_key": "secret-key-bytes",
    })

    # Execute shredding
    receipt = await shredder.execute_shredding(bubble_id, host_id)

    # 1. Verify receipt is generated with valid signature
    assert receipt.bubble_id == bubble_id
    assert receipt.deleted_document_count >= 30
    assert receipt.key_destruction_verified is True
    assert len(receipt.crypto_signature) == 64

    # 2. PROVE UNRECOVERABLE: Query every subcollection and assert 0 documents exist
    for subcol in SUBCOLLECTIONS_TO_SHRED:
        remaining = await bubble_ref.collection(subcol).get()
        assert len(remaining) == 0, f"Subcollection {subcol} was not completely purged!"

    # 3. Assert key material is destroyed
    key_snap = await mock_db.collection("_crypto_keys").document(bubble_id).get()
    assert not key_snap.exists, "Crypto key material survived shredding!"

    # 4. Assert root document title is redacted
    b_snap = await bubble_ref.get()
    assert b_snap.to_dict()["title"] == "[SHREDDED_BUBBLE]"
    assert b_snap.to_dict()["pop_state"] == "POPPED"
